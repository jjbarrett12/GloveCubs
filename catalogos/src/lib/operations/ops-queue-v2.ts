/**
 * Operations command center v2: work queue with aging, blocked items, direct actions.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";

const MS_1D = 24 * 60 * 60 * 1000;
const MS_3D = 3 * MS_1D;
const MS_7D = 7 * MS_1D;

export interface PendingSyncItem {
  id: string;
  run_id: string;
  external_id: string;
  result_type: string;
  created_at: string;
  run_started_at?: string;
  supplier_id?: string;
}

export interface PromotedUnreviewedItem {
  sync_item_id: string;
  normalized_id: string;
  external_id: string;
  run_id: string;
  created_at: string;
}

export interface StaleBucket {
  within1d: number;
  within3d: number;
  within7dPlus: number;
}

export interface OpsQueueSummaryV2 {
  pendingSyncPromotions: PendingSyncItem[];
  pendingSyncPromotionsCount: number;
  promotedButUnreviewed: PromotedUnreviewedItem[];
  promotedButUnreviewedCount: number;
  stagedBlockedByMissingAttrsCount: number;
  stagedBlockedSample: { id: string; normalized_id: string }[];
  discontinuedPendingCount: number;
  duplicateWarningsCount: number;
  failedRuns: { type: string; id: string; message?: string; at: string }[];
  staleSyncItems: StaleBucket;
  staleStaged: StaleBucket;
}

function bucketByAge(createdAts: string[]): StaleBucket {
  const now = Date.now();
  let within1d = 0;
  let within3d = 0;
  let within7dPlus = 0;
  for (const at of createdAts) {
    const age = now - new Date(at).getTime();
    if (age <= MS_1D) within1d++;
    else if (age <= MS_3D) within3d++;
    else within7dPlus++;
  }
  return { within1d, within3d, within7dPlus };
}

export async function getOpsQueueSummaryV2(options?: { limitPerCategory?: number }): Promise<OpsQueueSummaryV2> {
  const supabase = getSupabaseCatalogos(true);
  const limit = options?.limitPerCategory ?? 25;

  const [
    pendingSyncRes,
    promotedUnreviewedRes,
    stagedPendingRes,
    discontinuedRes,
    duplicatesRes,
    failedBatchesRes,
    failedSyncRes,
    failedMatchRes,
  ] = await Promise.all([
    supabase
      .from("catalog_sync_item_results")
      .select("id, run_id, external_id, result_type, created_at")
      .eq("lifecycle_status", "pending")
      .in("result_type", ["new", "changed"])
      .limit(limit * 2),
    supabase
      .from("catalog_sync_item_results")
      .select("id, run_id, external_id, promoted_normalized_id, created_at")
      .in("lifecycle_status", ["promoted", "in_review"])
      .not("promoted_normalized_id", "is", null)
      .limit(limit * 2),
    supabase
      .from("supplier_products_normalized")
      .select("id, normalized_data, created_at")
      .eq("status", "pending")
      .limit(500),
    supabase.from("discontinued_product_candidates").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
    supabase.from("product_duplicate_candidates").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
    supabase.from("import_batches").select("id, completed_at, error_message").eq("status", "failed").order("started_at", { ascending: false }).limit(10),
    supabase.from("catalog_sync_runs").select("id, completed_at, error_message").eq("status", "failed").order("started_at", { ascending: false }).limit(10),
    supabase.from("product_match_runs").select("id, completed_at, error_message").eq("status", "failed").order("started_at", { ascending: false }).limit(10),
  ]);

  const pendingSync = (pendingSyncRes.data ?? []) as { id: string; run_id: string; external_id: string; result_type: string; created_at: string }[];
  const runIds = [...new Set(pendingSync.map((s) => s.run_id))];
  let runMeta: Record<string, { started_at: string; supplier_id: string }> = {};
  if (runIds.length > 0) {
    const { data: runs } = await supabase.from("catalog_sync_runs").select("id, started_at, supplier_id").in("id", runIds);
    for (const r of runs ?? []) {
      runMeta[r.id as string] = { started_at: r.started_at as string, supplier_id: r.supplier_id as string };
    }
  }
  const pendingSyncPromotions = pendingSync.slice(0, limit).map((s) => ({
    ...s,
    run_started_at: runMeta[s.run_id]?.started_at,
    supplier_id: runMeta[s.run_id]?.supplier_id,
  }));

  const promotedRows = (promotedUnreviewedRes.data ?? []) as {
    id: string;
    run_id: string;
    external_id: string;
    promoted_normalized_id: string;
    created_at: string;
  }[];
  const normIds = promotedRows.map((r) => r.promoted_normalized_id).filter(Boolean);
  let stagedStatusByNormId: Record<string, string> = {};
  if (normIds.length > 0) {
    const { data: staged } = await supabase
      .from("supplier_products_normalized")
      .select("id, status")
      .in("id", normIds);
    for (const s of staged ?? []) {
      stagedStatusByNormId[s.id as string] = s.status as string;
    }
  }
  const promotedUnreviewedAll = promotedRows
    .filter((r) => stagedStatusByNormId[r.promoted_normalized_id] === "pending")
    .map((r) => ({
      sync_item_id: r.id,
      normalized_id: r.promoted_normalized_id,
      external_id: r.external_id,
      run_id: r.run_id,
      created_at: r.created_at,
    }));
  const promotedButUnreviewed = promotedUnreviewedAll.slice(0, limit);

  const stagedPending = (stagedPendingRes.data ?? []) as { id: string; normalized_data: Record<string, unknown>; created_at?: string }[];
  const blockedByMissing = stagedPending.filter((s) => {
    const flags = (s.normalized_data?.anomaly_flags as { code?: string }[]) ?? [];
    return flags.some((f) => f.code === "missing_required" || f.code === "missing_required_attributes");
  });
  const stagedBlockedSample = blockedByMissing.slice(0, 10).map((s) => ({ id: s.id, normalized_id: s.id }));

  const failedRuns: OpsQueueSummaryV2["failedRuns"] = [];
  for (const b of failedBatchesRes.data ?? []) {
    failedRuns.push({ type: "import_batch", id: b.id as string, at: (b.completed_at as string) ?? "" });
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

  const syncItemCreatedAts = pendingSync.map((s) => s.created_at).concat(promotedRows.map((r) => r.created_at));
  const stagedCreatedAts = stagedPending.map((s) => s.created_at ?? "").filter(Boolean);

  return {
    pendingSyncPromotions,
    pendingSyncPromotionsCount: pendingSync.length,
    promotedButUnreviewed,
    promotedButUnreviewedCount: promotedUnreviewedAll.length,
    stagedBlockedByMissingAttrsCount: blockedByMissing.length,
    stagedBlockedSample,
    discontinuedPendingCount: discontinuedRes.count ?? 0,
    duplicateWarningsCount: duplicatesRes.count ?? 0,
    failedRuns: failedRuns.slice(0, 15),
    staleSyncItems: bucketByAge(syncItemCreatedAts),
    staleStaged: bucketByAge(stagedCreatedAts.length > 0 ? stagedCreatedAts : []),
  };
}
