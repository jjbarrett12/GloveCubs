/**
 * Create an import batch for a given feed and supplier.
 * Batch is the traceability root for all raw and normalized rows.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";

export type ImportBatchSourceKind = "feed" | "csv_upload" | "excel" | "pdf" | "other";

export interface CreateBatchInput {
  feedId: string | null;
  supplierId: string;
  /** Provenance for file-based imports (defaults to feed). */
  sourceKind?: ImportBatchSourceKind;
  previewSessionId?: string | null;
  sourceFilename?: string | null;
}

export interface CreateBatchResult {
  batchId: string;
}

/**
 * Create a new import_batch with status 'running'.
 * Returns the new batch UUID.
 */
export async function createImportBatch(input: CreateBatchInput): Promise<CreateBatchResult> {
  const supabase = getSupabaseCatalogos(true);

  const { data, error } = await supabase
    .from("import_batches")
    .insert({
      feed_id: input.feedId,
      supplier_id: input.supplierId,
      status: "running",
      stats: {},
      source_kind: input.sourceKind ?? "feed",
      preview_session_id: input.previewSessionId ?? null,
      source_filename: input.sourceFilename ?? null,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create import batch: ${error.message}`);
  if (!data?.id) throw new Error("Import batch created but no id returned");

  return { batchId: data.id as string };
}

export type ImportBatchCoreStats = {
  raw_count: number;
  normalized_count: number;
  matched_count: number;
  anomaly_row_count: number;
  error_count: number;
};

/**
 * Merge into import_batches.stats (JSONB) without changing status. Best-effort on read failure.
 */
export async function patchImportBatchStats(
  batchId: string,
  patch: Record<string, unknown>
): Promise<void> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error: fetchErr } = await supabase
    .from("import_batches")
    .select("stats")
    .eq("id", batchId)
    .single();
  if (fetchErr) return;
  const prev = (data?.stats as Record<string, unknown> | null) ?? {};
  const next = { ...prev, ...patch };
  await supabase.from("import_batches").update({ stats: next }).eq("id", batchId);
}

/**
 * Update batch status and stats, and set completed_at when finished.
 * Merges with existing stats so progress fields (e.g. chunks_processed) are preserved unless overwritten.
 */
export async function updateBatchCompletion(
  batchId: string,
  status: "completed" | "failed" | "cancelled",
  stats: ImportBatchCoreStats & Record<string, unknown>
): Promise<void> {
  const supabase = getSupabaseCatalogos(true);

  const { data, error: fetchErr } = await supabase
    .from("import_batches")
    .select("stats")
    .eq("id", batchId)
    .single();
  const prev = fetchErr ? {} : ((data?.stats as Record<string, unknown> | null) ?? {});
  const merged = { ...prev, ...stats };

  const { error } = await supabase
    .from("import_batches")
    .update({
      status,
      completed_at: new Date().toISOString(),
      stats: merged,
    })
    .eq("id", batchId);

  if (error) throw new Error(`Failed to update batch: ${error.message}`);
}

/**
 * Append a log entry for the batch (import_batch_logs).
 */
export async function logBatchStep(
  batchId: string,
  step: string,
  status: "started" | "success" | "failed",
  message?: string,
  payload?: Record<string, unknown>
): Promise<void> {
  const supabase = getSupabaseCatalogos(true);
  await supabase.from("import_batch_logs").insert({
    batch_id: batchId,
    step,
    status,
    message: message ?? null,
    payload: payload ?? null,
  });
}
