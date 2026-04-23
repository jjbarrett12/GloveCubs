/**
 * Promote catalog sync item results to staging (supplier_products_normalized).
 * Idempotent: if already promoted, return existing normalized_id.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";
import { insertRawRows } from "@/lib/ingestion/raw-service";
import { runNormalization } from "@/lib/normalization/normalization-engine";
import { buildStagingPayload } from "@/lib/normalization/staging-payload";
import { loadSynonymMap } from "@/lib/catalogos/dictionary-service";
import { setLifecycleStatus } from "@/lib/catalog-expansion/lifecycle";
import type { NormalizationResult } from "@/lib/normalization/types";

const SYNC_PROMOTION_SOURCE = "sync_promotion";

export interface PromoteResult {
  success: boolean;
  normalizedId?: string;
  error?: string;
}

/**
 * Get or create the sync-promotion import_batch for this run (one batch per run).
 */
async function getOrCreateSyncPromotionBatch(runId: string, supplierId: string): Promise<string> {
  const supabase = getSupabaseCatalogos(true);
  const { data: existing } = await supabase
    .from("import_batches")
    .select("id, stats")
    .eq("supplier_id", supplierId)
    .is("feed_id", null)
    .eq("status", "completed");

  const match = (existing ?? []).find(
    (b) => (b as { stats?: { sync_run_id?: string } }).stats?.sync_run_id === runId
  );
  if (match) return match.id as string;

  const now = new Date().toISOString();
  const { data: created, error } = await supabase
    .from("import_batches")
    .insert({
      feed_id: null,
      supplier_id: supplierId,
      status: "completed",
      stats: { source: SYNC_PROMOTION_SOURCE, sync_run_id: runId, raw_count: 0, normalized_count: 0 },
      completed_at: now,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create sync promotion batch: ${error.message}`);
  return created.id as string;
}

/**
 * Promote a sync item result (new or changed) to a staged row.
 * Uses current_snapshot to create raw + normalized; idempotent if already promoted.
 */
export async function promoteSyncItemToStaging(syncItemResultId: string): Promise<PromoteResult> {
  const supabase = getSupabaseCatalogos(true);

  const { data: item, error: itemErr } = await supabase
    .from("catalog_sync_item_results")
    .select("id, run_id, external_id, result_type, prior_raw_id, prior_normalized_id, current_snapshot, promotion_status, promoted_normalized_id, lifecycle_status")
    .eq("id", syncItemResultId)
    .single();

  if (itemErr || !item) return { success: false, error: "Sync item result not found" };

  const lifecycleStatus = (item as { lifecycle_status?: string }).lifecycle_status;
  const promotionStatus = (item as { promotion_status?: string }).promotion_status;
  const promotedId = (item as { promoted_normalized_id?: string | null }).promoted_normalized_id;
  if (promotionStatus === "promoted" && promotedId) {
    return { success: true, normalizedId: promotedId };
  }
  if (promotionStatus === "rejected" || lifecycleStatus === "rejected") {
    return { success: false, error: "Sync item was rejected" };
  }
  if (lifecycleStatus === "superseded") {
    return { success: false, error: "Sync item was superseded by a newer result" };
  }

  const resultType = (item as { result_type: string }).result_type;
  if (resultType !== "new" && resultType !== "changed") {
    return { success: false, error: "Only new or changed items can be promoted" };
  }

  const currentSnapshot = (item as { current_snapshot?: Record<string, unknown> | null }).current_snapshot;
  if (!currentSnapshot || typeof currentSnapshot !== "object") {
    return { success: false, error: "No current_snapshot; re-run sync to capture feed row" };
  }

  const { data: run } = await supabase
    .from("catalog_sync_runs")
    .select("supplier_id")
    .eq("id", (item as { run_id: string }).run_id)
    .single();
  if (!run?.supplier_id) return { success: false, error: "Sync run not found" };
  const supplierId = run.supplier_id as string;

  const batchId = await getOrCreateSyncPromotionBatch((item as { run_id: string }).run_id, supplierId);

  const externalId = (item as { external_id: string }).external_id;
  const { rawIds, errors: rawErrors } = await insertRawRows({
    batchId,
    supplierId,
    rows: [currentSnapshot as Record<string, unknown>],
  });
  if (rawErrors.length > 0 || !rawIds[0]) {
    return { success: false, error: rawErrors[0] ?? "Failed to insert raw row" };
  }
  const rawId = rawIds[0].rawId;

  const synonymMap = await loadSynonymMap();
  const normResult = runNormalization(currentSnapshot as Record<string, unknown>, {
    categoryHint: "disposable_gloves",
    synonymMap,
  }) as NormalizationResult;

  const payload = buildStagingPayload({
    result: normResult,
    batchId,
    rawId,
    supplierId,
    matchConfidence: null,
    masterProductId: null,
    extraAnomalyFlags: [],
  });

  const nd = payload.normalized_data as unknown as Record<string, unknown>;
  const priorNormalizedId = (item as { prior_normalized_id?: string | null }).prior_normalized_id;
  const sourceMeta = {
    source_sync_result_id: syncItemResultId,
    prior_normalized_id: priorNormalizedId ?? undefined,
    prior_raw_id: (item as { prior_raw_id?: string | null }).prior_raw_id ?? undefined,
    promotion_from: resultType,
  };
  const normalizedDataWithMeta = {
    ...nd,
    ...sourceMeta,
    name: nd.canonical_title,
    sku: nd.supplier_sku,
    cost: nd.supplier_cost,
    attributes: nd.filter_attributes,
    anomaly_flags: nd.anomaly_flags,
  };

  const { data: normRow, error: normErr } = await supabase
    .from("supplier_products_normalized")
    .insert({
      batch_id: payload.batch_id,
      raw_id: payload.raw_id,
      supplier_id: payload.supplier_id,
      normalized_data: normalizedDataWithMeta,
      attributes: payload.attributes,
      match_confidence: payload.match_confidence,
      master_product_id: payload.master_product_id,
      status: "pending",
    })
    .select("id")
    .single();

  if (normErr) return { success: false, error: normErr.message };
  const normalizedId = normRow.id as string;

  const { error: updateErr } = await supabase
    .from("catalog_sync_item_results")
    .update({
      promoted_normalized_id: normalizedId,
      promotion_status: "promoted",
      resolved_at: new Date().toISOString(),
      resolution: "approved",
    })
    .eq("id", syncItemResultId);

  if (updateErr) return { success: false, error: updateErr.message };
  await setLifecycleStatus(syncItemResultId, "promoted");
  return { success: true, normalizedId };
}
