/**
 * Unified operations queue: aggregates pending sync approvals, staged backlog,
 * discontinued confirmations, duplicate warnings, failed runs/feeds.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";

export interface PendingSyncApproval {
  id: string;
  run_id: string;
  external_id: string;
  result_type: string;
  change_summary: Record<string, unknown>;
  requires_review: boolean;
  promotion_status: string;
  run_started_at?: string;
  supplier_id?: string;
}

export interface OpsQueueSummary {
  pendingSyncApprovals: PendingSyncApproval[];
  pendingSyncApprovalsCount: number;
  stagedReviewBacklogCount: number;
  discontinuedPendingCount: number;
  duplicateWarningsCount: number;
  failedRuns: { type: string; id: string; message?: string; at: string }[];
}

/**
 * Fetch counts and recent items for the operations command center.
 */
export async function getOpsQueueSummary(options?: { limitPerCategory?: number }): Promise<OpsQueueSummary> {
  const supabase = getSupabaseCatalogos(true);
  const limit = options?.limitPerCategory ?? 20;

  const [
    syncItemsRes,
    stagedCountRes,
    discontinuedRes,
    duplicatesRes,
    failedBatchesRes,
    failedSyncRes,
    failedMatchRes,
  ] = await Promise.all([
    supabase
      .from("catalog_sync_item_results")
      .select("id, run_id, external_id, result_type, change_summary, requires_review, promotion_status")
      .eq("promotion_status", "pending")
      .in("result_type", ["new", "changed"])
      .limit(limit * 2),
    supabase.from("supplier_products_normalized").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("discontinued_product_candidates").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
    supabase.from("product_duplicate_candidates").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
    supabase.from("import_batches").select("id, completed_at, stats").eq("status", "failed").order("started_at", { ascending: false }).limit(10),
    supabase.from("catalog_sync_runs").select("id, completed_at, error_message").eq("status", "failed").order("started_at", { ascending: false }).limit(10),
    supabase.from("product_match_runs").select("id, completed_at, error_message").eq("status", "failed").order("started_at", { ascending: false }).limit(10),
  ]);

  const syncItems = (syncItemsRes.data ?? []) as PendingSyncApproval[];
  const runIds = [...new Set(syncItems.map((s) => s.run_id))];
  let runStarted: Record<string, string> = {};
  let runSupplier: Record<string, string> = {};
  if (runIds.length > 0) {
    const { data: runs } = await supabase
      .from("catalog_sync_runs")
      .select("id, started_at, supplier_id")
      .in("id", runIds);
    for (const r of runs ?? []) {
      runStarted[r.id as string] = r.started_at as string;
      runSupplier[r.id as string] = r.supplier_id as string;
    }
  }
  const pendingSyncApprovals = syncItems.slice(0, limit).map((s) => ({
    ...s,
    run_started_at: runStarted[s.run_id],
    supplier_id: runSupplier[s.run_id],
  }));

  const failedRuns: OpsQueueSummary["failedRuns"] = [];
  for (const b of failedBatchesRes.data ?? []) {
    failedRuns.push({
      type: "import_batch",
      id: b.id as string,
      at: (b.completed_at as string) ?? "",
    });
  }
  for (const r of failedSyncRes.data ?? []) {
    failedRuns.push({
      type: "catalog_sync",
      id: r.id as string,
      message: r.error_message as string,
      at: (r.completed_at as string) ?? "",
    });
  }
  for (const r of failedMatchRes.data ?? []) {
    failedRuns.push({
      type: "product_match",
      id: r.id as string,
      message: r.error_message as string,
      at: (r.completed_at as string) ?? "",
    });
  }
  failedRuns.sort((a, b) => (b.at > a.at ? 1 : -1));

  return {
    pendingSyncApprovals,
    pendingSyncApprovalsCount: syncItems.length,
    stagedReviewBacklogCount: stagedCountRes.count ?? 0,
    discontinuedPendingCount: discontinuedRes.count ?? 0,
    duplicateWarningsCount: duplicatesRes.count ?? 0,
    failedRuns: failedRuns.slice(0, 15),
  };
}
