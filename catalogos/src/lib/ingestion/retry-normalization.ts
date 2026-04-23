/**
 * Re-run normalize/match for raw rows in a batch that never received a normalized row
 * (e.g. bulk insert partial failure or transient errors). Idempotent: skips raw that already normalized.
 */

import type { ParsedRow } from "./types";
import { getSupabaseCatalogos } from "@/lib/db/client";
import { loadSynonymMap } from "@/lib/catalogos/dictionary-service";
import { runIngestionChunks } from "./ingestion-chunk-runner";
import { patchImportBatchStats, logBatchStep } from "./batch-service";
import { INGESTION_CHUNK_SIZE_DEFAULT } from "./ingestion-config";

export interface RetryNormalizationResult {
  batchId: string;
  pendingRawCount: number;
  normalizedAttempted: number;
  errors: string[];
}

export async function retryFailedNormalizationForBatch(
  batchId: string,
  supplierId: string,
  categoryId: string,
  options?: { chunkSize?: number }
): Promise<RetryNormalizationResult> {
  const supabase = getSupabaseCatalogos(true);
  const errors: string[] = [];

  const { data: rawRows, error: rawErr } = await supabase
    .from("supplier_products_raw")
    .select("id, external_id, raw_payload")
    .eq("batch_id", batchId)
    .eq("supplier_id", supplierId);

  if (rawErr) {
    return {
      batchId,
      pendingRawCount: 0,
      normalizedAttempted: 0,
      errors: [`load raw: ${rawErr.message}`],
    };
  }

  const { data: normRows, error: normErr } = await supabase
    .from("supplier_products_normalized")
    .select("raw_id")
    .eq("batch_id", batchId);

  if (normErr) {
    return {
      batchId,
      pendingRawCount: 0,
      normalizedAttempted: 0,
      errors: [`load normalized: ${normErr.message}`],
    };
  }

  const linked = new Set((normRows ?? []).map((n) => n.raw_id as string));
  const pending = (rawRows ?? []).filter((r) => !linked.has(r.id as string));

  if (pending.length === 0) {
    await logBatchStep(batchId, "retry_normalize", "success", "No pending raw rows without normalized sibling");
    return { batchId, pendingRawCount: 0, normalizedAttempted: 0, errors: [] };
  }

  await logBatchStep(batchId, "retry_normalize", "started", `Pending raw rows: ${pending.length}`);

  const rawIds = pending.map((r) => ({
    externalId: r.external_id as string,
    rawId: r.id as string,
  }));
  const parsedRows = pending.map((r) => (r.raw_payload ?? {}) as ParsedRow);
  const synonymMap = await loadSynonymMap();

  const chunkOut = await runIngestionChunks({
    batchId,
    supplierId,
    categoryId,
    rawIds,
    parsedRows,
    synonymMap,
    errors,
    chunkSize: options?.chunkSize ?? INGESTION_CHUNK_SIZE_DEFAULT,
  });

  const succeeded = chunkOut.rowResults.filter((r) => r.normalizedId).length;

  await patchImportBatchStats(batchId, {
    last_retry_at: new Date().toISOString(),
    last_retry_pending_count: pending.length,
    last_retry_normalized: succeeded,
  });

  await logBatchStep(batchId, "retry_normalize", "success", undefined, {
    pending: pending.length,
    normalized: succeeded,
    errors: chunkOut.errors.length,
  });

  return {
    batchId,
    pendingRawCount: pending.length,
    normalizedAttempted: succeeded,
    errors: chunkOut.errors,
  };
}
