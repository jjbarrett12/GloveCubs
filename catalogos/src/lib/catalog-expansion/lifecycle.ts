/**
 * Sync lifecycle status and supersession.
 * Lifecycle: pending → promoted → in_review → approved → published | rejected | superseded
 */

import { getSupabaseCatalogos } from "@/lib/db/client";

export type LifecycleStatus =
  | "pending"
  | "promoted"
  | "in_review"
  | "approved"
  | "published"
  | "rejected"
  | "superseded";

const UNRESOLVED_STATUSES: LifecycleStatus[] = ["pending", "promoted", "in_review"];

export async function setLifecycleStatus(
  syncItemResultId: string,
  status: LifecycleStatus,
  options?: { published_product_id?: string }
): Promise<void> {
  const supabase = getSupabaseCatalogos(true);
  const updates: Record<string, unknown> = {
    lifecycle_status: status,
    lifecycle_updated_at: new Date().toISOString(),
  };
  if (options?.published_product_id != null) updates.published_product_id = options.published_product_id;
  const { error } = await supabase
    .from("catalog_sync_item_results")
    .update(updates)
    .eq("id", syncItemResultId);
  if (error) throw new Error(error.message);
}

/**
 * Mark older unresolved sync items (same supplier + external_id) as superseded by the given new item id.
 * Call after inserting new results for a run.
 */
export async function supersedeOlderUnresolved(
  newSyncItemResultId: string,
  runId: string,
  externalId: string,
  supplierId: string
): Promise<number> {
  const supabase = getSupabaseCatalogos(true);

  const { data: currentRun } = await supabase
    .from("catalog_sync_runs")
    .select("started_at, feed_id")
    .eq("id", runId)
    .single();
  if (!currentRun?.started_at) return 0;

  const startedAt = currentRun.started_at as string;
  const feedId = (currentRun.feed_id as string) ?? null;

  const { data: olderItems } = await supabase
    .from("catalog_sync_item_results")
    .select("id, run_id")
    .eq("external_id", externalId)
    .in("lifecycle_status", UNRESOLVED_STATUSES)
    .neq("id", newSyncItemResultId);

  if (!olderItems?.length) return 0;

  const runIds = [...new Set(olderItems.map((o) => o.run_id))];
  const { data: runs } = await supabase
    .from("catalog_sync_runs")
    .select("id, started_at, supplier_id, feed_id")
    .in("id", runIds);

  const runsByRunId = new Map((runs ?? []).map((r) => [r.id, r]));
  const toSupersede = olderItems.filter((o) => {
    const run = runsByRunId.get(o.run_id);
    if (!run || run.supplier_id !== supplierId) return false;
    if (feedId != null && run.feed_id !== feedId) return false;
    return (run.started_at as string) < startedAt;
  });

  if (toSupersede.length === 0) return 0;

  const now = new Date().toISOString();
  for (const row of toSupersede) {
    await supabase
      .from("catalog_sync_item_results")
      .update({
        lifecycle_status: "superseded",
        superseded_by_sync_item_result_id: newSyncItemResultId,
        lifecycle_updated_at: now,
      })
      .eq("id", row.id);
  }
  return toSupersede.length;
}

/**
 * Derive in_review vs approved from staged row; optionally set published if product exists.
 */
export async function refreshLifecycleFromStaged(syncItemResultId: string): Promise<LifecycleStatus | null> {
  const supabase = getSupabaseCatalogos(true);
  const { data: item } = await supabase
    .from("catalog_sync_item_results")
    .select("id, promoted_normalized_id, lifecycle_status")
    .eq("id", syncItemResultId)
    .single();
  if (!item?.promoted_normalized_id) return null;

  const { data: staged } = await supabase
    .from("supplier_products_normalized")
    .select("id, status, master_product_id")
    .eq("id", item.promoted_normalized_id)
    .single();

  if (!staged) return null;
  const status = staged.status as string;
  const masterId = staged.master_product_id as string | null;

  let next: LifecycleStatus;
  if (status === "pending") next = "in_review";
  else if (status === "approved" || status === "merged") next = "approved";
  else next = (item.lifecycle_status as LifecycleStatus) ?? "promoted";

  await setLifecycleStatus(syncItemResultId, next, next === "approved" && masterId ? { published_product_id: masterId } : undefined);
  return next;
}
