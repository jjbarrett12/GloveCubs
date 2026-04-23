/**
 * Bridge URL import products into the existing import pipeline.
 * Creates import_batch, supplier_products_raw from url_import_products, then runs
 * normalize/match/stage/family-inference via runPipelineFromParsedRows.
 */

import { runPipelineFromParsedRows } from "@/lib/ingestion/run-pipeline";
import { urlImportPayloadToParsedRow } from "./to-parsed-row";
import type { ParsedRow } from "@/lib/ingestion/types";
import { getSupabaseCatalogos } from "@/lib/db/client";
import { emitUrlImportEvent } from "./telemetry";

export interface BridgeUrlImportToBatchInput {
  jobId: string;
  /** Optional: only bridge these product IDs; otherwise all products in job. */
  productIds?: string[];
}

export interface BridgeUrlImportToBatchResult {
  success: boolean;
  batchId?: string;
  normalizedCount?: number;
  error?: string;
}

export async function bridgeUrlImportToBatch(
  input: BridgeUrlImportToBatchInput
): Promise<BridgeUrlImportToBatchResult> {
  const supabase = getSupabaseCatalogos(true);
  const { data: job, error: jobErr } = await supabase
    .from("url_import_jobs")
    .select("id, supplier_id")
    .eq("id", input.jobId)
    .single();

  if (jobErr || !job) return { success: false, error: "URL import job not found" };
  const supplierId = (job as { supplier_id: string }).supplier_id;

  let query = supabase
    .from("url_import_products")
    .select("id, normalized_payload")
    .eq("job_id", input.jobId);
  if (input.productIds?.length) query = query.in("id", input.productIds);
  const { data: products, error: prodErr } = await query;

  if (prodErr) return { success: false, error: prodErr.message };
  const list = (products ?? []) as { id: string; normalized_payload: Record<string, unknown> }[];
  if (list.length === 0) return { success: false, error: "No products to import" };

  const rows: ParsedRow[] = list.map((p) => urlImportPayloadToParsedRow(p.normalized_payload ?? {}));

  try {
    const result = await runPipelineFromParsedRows({
      supplierId,
      feedId: null,
      rows,
    });

    await supabase
      .from("url_import_jobs")
      .update({ import_batch_id: result.batchId })
      .eq("id", input.jobId);

    emitUrlImportEvent({
      type: "import_bridge_success",
      jobId: input.jobId,
      batchId: result.batchId!,
      normalizedCount: result.normalizedCount ?? 0,
    });
    return {
      success: true,
      batchId: result.batchId,
      normalizedCount: result.normalizedCount,
    };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    emitUrlImportEvent({ type: "import_bridge_failed", jobId: input.jobId, error: err });
    return {
      success: false,
      error: err,
    };
  }
}
