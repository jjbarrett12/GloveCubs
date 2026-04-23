/**
 * Phase 1 ingestion pipeline orchestration.
 * Uses attribute dictionary: runNormalization (synonym + allowed values + validation), then match, price, stage.
 * 1. Create batch 2. Fetch feed 3. Parse 4. Store raw 5. Normalize via dictionary 6. Match 7. Price 8. Flag anomalies 9. Insert staging (chunked bulk + retry)
 * Does not auto-publish; all rows land in staging (pending).
 */

import type { PipelineResult, RowPipelineResult, NormalizedData, BatchResultSummary, ParsedRow } from "./types";
import { fetchFeed } from "./fetch-feed";
import { parseFeed } from "./parsers";
import {
  createImportBatch,
  updateBatchCompletion,
  logBatchStep,
  patchImportBatchStats,
  type ImportBatchSourceKind,
} from "./batch-service";
import { insertRawRows } from "./raw-service";
import { getSupabaseCatalogos } from "@/lib/db/client";
import { loadSynonymMap } from "@/lib/catalogos/dictionary-service";
import { runFamilyInferenceForBatch } from "@/lib/variant-family/run-family-inference";
import { runResolutionForBatch } from "@/lib/product-resolution/run-resolution-for-batch";
import { runIngestionChunks } from "./ingestion-chunk-runner";
import {
  INGESTION_CHUNK_SIZE_DEFAULT,
  INGESTION_MAX_FEED_ROWS,
} from "./ingestion-config";
import { runImageEnrichmentForBatch } from "./image-enrichment";
import { runImageOwnershipForBatch } from "./image-ownership";
import { runIngestionDispositionForBatch } from "./ingestion-disposition";

async function runPostResolutionTail(
  batchId: string,
  categoryId: string,
  importJobId?: string | null
): Promise<void> {
  if (importJobId) {
    try {
      const { patchSupplierImportJob } = await import("@/lib/supplier-import-job/service");
      await patchSupplierImportJob(importJobId, {
        status: "image_enrichment",
        current_stage: "Image enrichment",
        stats: { phase: "image_enrichment" },
      });
    } catch {
      /* non-fatal */
    }
  }

  try {
    await logBatchStep(batchId, "image_enrichment", "started", "Resolving product images");
    const imgStats = await runImageEnrichmentForBatch(batchId, categoryId);
    await logBatchStep(batchId, "image_enrichment", "success", undefined, {
      ...imgStats,
    } as unknown as Record<string, unknown>);
  } catch (e) {
    await logBatchStep(
      batchId,
      "image_enrichment",
      "failed",
      e instanceof Error ? e.message : String(e)
    );
  }

  try {
    await logBatchStep(batchId, "image_ownership", "started", "Copying hero images to catalog storage");
    const ownStats = await runImageOwnershipForBatch(batchId);
    await logBatchStep(batchId, "image_ownership", "success", undefined, {
      ...ownStats,
    } as unknown as Record<string, unknown>);
  } catch (e) {
    await logBatchStep(
      batchId,
      "image_ownership",
      "failed",
      e instanceof Error ? e.message : String(e)
    );
  }

  try {
    const disp = await runIngestionDispositionForBatch(batchId);
    await logBatchStep(batchId, "ingestion_disposition", "success", undefined, {
      ...disp,
    } as unknown as Record<string, unknown>);
  } catch (e) {
    await logBatchStep(
      batchId,
      "ingestion_disposition",
      "failed",
      e instanceof Error ? e.message : String(e)
    );
  }
}

export interface RunPipelineInput {
  feedId: string | null;
  supplierId: string;
  feedUrl: string;
  categoryId: string;
}

/** Input for running pipeline from already-parsed rows (e.g. AI CSV mapping output). */
export interface RunPipelineFromParsedInput {
  supplierId: string;
  feedId?: string | null;
  rows: ParsedRow[];
  previewSessionId?: string | null;
  sourceFilename?: string | null;
  sourceKind?: ImportBatchSourceKind;
}

function scheduleBackground(fn: () => Promise<void>): void {
  void (async () => {
    try {
      const mod = await import("@vercel/functions");
      if (typeof mod.waitUntil === "function") {
        mod.waitUntil(fn());
        return;
      }
    } catch {
      /* @vercel/functions not installed or non-Vercel runtime */
    }
    void fn();
  })();
}

/**
 * Resolve category_id for disposable_gloves (slug -> id).
 */
async function resolveCategoryId(slug: string): Promise<string> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase.from("categories").select("id").eq("slug", slug).single();
  if (error || !data?.id) throw new Error(`Category not found: ${slug}`);
  return data.id as string;
}

function computeIngestionPhase(params: {
  status: "completed" | "failed";
  normalized_count: number;
  raw_count: number;
  anomaly_row_count: number;
  error_count: number;
}): string {
  if (params.status === "failed") return "failed";
  if (params.raw_count > 0 && params.normalized_count === 0) return "failed";
  if (params.anomaly_row_count > 0 || params.error_count > 0) return "needs_review";
  return "staged";
}

async function revalidateIngestionPaths(): Promise<void> {
  try {
    const { revalidatePath } = await import("next/cache");
    revalidatePath("/dashboard/batches");
    revalidatePath("/dashboard/review");
  } catch {
    /* next/cache unavailable in some runtimes */
  }
}

/**
 * Run fetch → parse → raw insert → chunked normalize (not for parsed-rows-only entry).
 */
export async function runPipelineBody(
  batchId: string,
  input: RunPipelineInput,
  options?: { chunkSize?: number }
): Promise<PipelineResult> {
  const categoryId = input.categoryId;
  const errors: string[] = [];
  const chunkSize = options?.chunkSize ?? INGESTION_CHUNK_SIZE_DEFAULT;

  await patchImportBatchStats(batchId, { ingestion_phase: "processing" });

  await logBatchStep(batchId, "fetch", "started", `Fetching ${input.feedUrl}`);

  let fetched: Awaited<ReturnType<typeof fetchFeed>>;
  try {
    fetched = await fetchFeed({ url: input.feedUrl });
    if (!fetched.ok) throw new Error(`HTTP ${fetched.status}`);
  } catch (e) {
    await logBatchStep(batchId, "fetch", "failed", e instanceof Error ? e.message : "Fetch failed");
    await updateBatchCompletion(batchId, "failed", {
      raw_count: 0,
      normalized_count: 0,
      matched_count: 0,
      anomaly_row_count: 0,
      error_count: 1,
      ingestion_phase: "failed",
      processing_time_ms: 0,
      chunks_processed: 0,
      rows_retried: 0,
      rows_failed: 0,
      rows_processed: 0,
    });
    throw e;
  }

  await logBatchStep(batchId, "parse", "started");
  let parsed: ReturnType<typeof parseFeed>;
  try {
    parsed = parseFeed(fetched);
  } catch (e) {
    await logBatchStep(batchId, "parse", "failed", e instanceof Error ? e.message : "Parse failed");
    await updateBatchCompletion(batchId, "failed", {
      raw_count: 0,
      normalized_count: 0,
      matched_count: 0,
      anomaly_row_count: 0,
      error_count: 1,
      ingestion_phase: "failed",
      processing_time_ms: 0,
      chunks_processed: 0,
      rows_retried: 0,
      rows_failed: 0,
      rows_processed: 0,
    });
    throw e;
  }

  if (parsed.rowCount === 0) {
    await logBatchStep(batchId, "parse", "success", "No rows");
    await updateBatchCompletion(batchId, "completed", {
      raw_count: 0,
      normalized_count: 0,
      matched_count: 0,
      anomaly_row_count: 0,
      error_count: 0,
      ingestion_phase: "staged",
      processing_time_ms: 0,
      chunks_processed: 0,
      rows_retried: 0,
      rows_failed: 0,
      rows_processed: 0,
    });
    await revalidateIngestionPaths();
    return {
      batchId,
      supplierId: input.supplierId,
      rawCount: 0,
      normalizedCount: 0,
      matchedCount: 0,
      anomalyRowCount: 0,
      rowResults: [],
      errors: [],
      summary: {
        totalRowsProcessed: 0,
        rowsSucceeded: 0,
        rowsFailed: 0,
        duplicatesSkipped: 0,
        canonicalProductsCreated: 0,
        supplierOffersCreated: 0,
        warnings: [],
        ingestion_phase: "staged",
        processing_time_ms: 0,
        chunks_processed: 0,
        rows_retried: 0,
      },
    };
  }

  if (parsed.rows.length > INGESTION_MAX_FEED_ROWS) {
    errors.push(
      `Row limit exceeded: feed has ${parsed.rows.length} rows; only first ${INGESTION_MAX_FEED_ROWS} will be processed.`
    );
    parsed.rows = parsed.rows.slice(0, INGESTION_MAX_FEED_ROWS);
    parsed.rowCount = parsed.rows.length;
  }

  await logBatchStep(batchId, "raw_insert", "started", `Inserting ${parsed.rows.length} raw rows`);
  const { rawIds, errors: rawErrors } = await insertRawRows({
    batchId,
    supplierId: input.supplierId,
    rows: parsed.rows,
  });
  errors.push(...rawErrors);
  await logBatchStep(batchId, "raw_insert", "success", `${rawIds.length} raw rows inserted`);

  return finalizeAfterRawRows({
    batchId,
    supplierId: input.supplierId,
    categoryId,
    rawIds,
    parsedRows: parsed.rows,
    errors,
    chunkSize,
    totalRowsForSummary: parsed.rows.length,
    skippedLineCount: parsed.skippedLineCount,
    importJobId: null,
  });
}

export async function runPipelineFromParsedBody(
  batchId: string,
  input: RunPipelineFromParsedInput,
  categoryId: string,
  options?: { chunkSize?: number }
): Promise<PipelineResult> {
  const errors: string[] = [];
  const chunkSize = options?.chunkSize ?? INGESTION_CHUNK_SIZE_DEFAULT;
  await patchImportBatchStats(batchId, { ingestion_phase: "processing" });

  let rowsToProcess = input.rows;
  if (rowsToProcess.length > INGESTION_MAX_FEED_ROWS) {
    errors.push(
      `Row limit exceeded: ${rowsToProcess.length} rows; only first ${INGESTION_MAX_FEED_ROWS} will be processed.`
    );
    rowsToProcess = rowsToProcess.slice(0, INGESTION_MAX_FEED_ROWS);
  }

  await logBatchStep(batchId, "raw_insert", "started", `Inserting ${rowsToProcess.length} raw rows`);
  const { rawIds, errors: rawErrors } = await insertRawRows({
    batchId,
    supplierId: input.supplierId,
    rows: rowsToProcess,
  });
  errors.push(...rawErrors);
  await logBatchStep(batchId, "raw_insert", "success", `${rawIds.length} raw rows inserted`);

  return finalizeAfterRawRows({
    batchId,
    supplierId: input.supplierId,
    categoryId,
    rawIds,
    parsedRows: rowsToProcess,
    errors,
    chunkSize,
    totalRowsForSummary: rowsToProcess.length,
    skippedLineCount: 0,
    importJobId: null,
  });
}

export async function finalizeAfterRawRows(params: {
  batchId: string;
  supplierId: string;
  categoryId: string;
  rawIds: { externalId: string; rawId: string }[];
  parsedRows: ParsedRow[];
  errors: string[];
  chunkSize: number;
  totalRowsForSummary: number;
  skippedLineCount?: number;
  /** When set, job row is patched to image_enrichment before the tail runs. */
  importJobId?: string | null;
  onChunkComplete?: Parameters<typeof runIngestionChunks>[0]["onChunkComplete"];
  shouldAbort?: Parameters<typeof runIngestionChunks>[0]["shouldAbort"];
}): Promise<PipelineResult> {
  const {
    batchId,
    supplierId,
    categoryId,
    rawIds,
    parsedRows,
    errors,
    chunkSize,
    totalRowsForSummary,
    skippedLineCount,
    onChunkComplete,
    shouldAbort,
    importJobId,
  } = params;

  const synonymMap = await loadSynonymMap();
  let chunkOut: Awaited<ReturnType<typeof runIngestionChunks>>;
  try {
    chunkOut = await runIngestionChunks({
      batchId,
      supplierId,
      categoryId,
      rawIds,
      parsedRows,
      synonymMap,
      errors,
      chunkSize,
      onChunkComplete,
      shouldAbort,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Chunk ingestion failed";
    await logBatchStep(batchId, "normalize_match", "failed", msg);
    errors.push(msg);
    await updateBatchCompletion(batchId, "failed", {
      raw_count: rawIds.length,
      normalized_count: 0,
      matched_count: 0,
      anomaly_row_count: 0,
      error_count: errors.length,
      ingestion_phase: "failed",
      processing_time_ms: 0,
      chunks_processed: 0,
      rows_retried: 0,
      rows_failed: rawIds.length,
      rows_processed: 0,
    });
    await revalidateIngestionPaths();
    throw e;
  }

  const rowsSucceededPartial = chunkOut.rowResults.filter((r) => r.normalizedId).length;

  if (chunkOut.aborted) {
    await logBatchStep(
      batchId,
      "normalize_match",
      "failed",
      "Processing stopped (cancel requested or cooperative abort)"
    );
    await updateBatchCompletion(batchId, "cancelled", {
      raw_count: rawIds.length,
      normalized_count: rowsSucceededPartial,
      matched_count: chunkOut.matchedCount,
      anomaly_row_count: chunkOut.anomalyRowCount,
      error_count: chunkOut.errors.length,
      ingestion_phase: "cancelled",
      processing_time_ms: chunkOut.processingTimeMs,
      chunks_processed: chunkOut.chunksProcessed,
      rows_retried: chunkOut.rowsRetried,
      rows_failed: Math.max(0, rawIds.length - rowsSucceededPartial),
      rows_processed: chunkOut.rowResults.length,
    });
    await revalidateIngestionPaths();
    const summaryAborted: BatchResultSummary = {
      totalRowsProcessed: totalRowsForSummary,
      rowsSucceeded: rowsSucceededPartial,
      rowsFailed: totalRowsForSummary - rowsSucceededPartial,
      duplicatesSkipped: 0,
      canonicalProductsCreated: 0,
      supplierOffersCreated: chunkOut.rowResults.filter((r) => r.offerCreated).length,
      warnings: ["Import cancelled before all rows were processed"],
      ingestion_phase: "cancelled",
      processing_time_ms: chunkOut.processingTimeMs,
      chunks_processed: chunkOut.chunksProcessed,
      rows_retried: chunkOut.rowsRetried,
    };
    return {
      batchId,
      supplierId,
      rawCount: rawIds.length,
      normalizedCount: rowsSucceededPartial,
      matchedCount: chunkOut.matchedCount,
      anomalyRowCount: chunkOut.anomalyRowCount,
      rowResults: chunkOut.rowResults,
      errors: chunkOut.errors,
      summary: summaryAborted,
      aborted: true,
    };
  }

  await logBatchStep(batchId, "normalize_match", "success", undefined, {
    normalized: chunkOut.rowResults.length,
    matched: chunkOut.matchedCount,
    anomalies: chunkOut.anomalyRowCount,
  });

  const rowsSucceeded = rowsSucceededPartial;
  const phase = computeIngestionPhase({
    status: "completed",
    normalized_count: rowsSucceeded,
    raw_count: rawIds.length,
    anomaly_row_count: chunkOut.anomalyRowCount,
    error_count: chunkOut.errors.length,
  });

  await updateBatchCompletion(batchId, "completed", {
    raw_count: rawIds.length,
    normalized_count: rowsSucceeded,
    matched_count: chunkOut.matchedCount,
    anomaly_row_count: chunkOut.anomalyRowCount,
    error_count: chunkOut.errors.length,
    ingestion_phase: phase,
    processing_time_ms: chunkOut.processingTimeMs,
    chunks_processed: chunkOut.chunksProcessed,
    rows_retried: chunkOut.rowsRetried,
    rows_failed: rawIds.length - rowsSucceeded,
    rows_processed: chunkOut.rowResults.length,
  });

  try {
    const inferenceResult = await runFamilyInferenceForBatch(batchId);
    if (inferenceResult.groupedCount > 0) {
      await logBatchStep(batchId, "family_inference", "success", undefined, {
        updated: inferenceResult.updated,
        grouped_families: inferenceResult.groupedCount,
      });
    }
  } catch (e) {
    await logBatchStep(
      batchId,
      "family_inference",
      "failed",
      e instanceof Error ? e.message : String(e)
    );
  }

  try {
    const resolutionResult = await runResolutionForBatch(batchId);
    if (resolutionResult.candidatesCreated > 0) {
      await logBatchStep(batchId, "resolution", "success", undefined, {
        rows_processed: resolutionResult.rowsProcessed,
        candidates_created: resolutionResult.candidatesCreated,
        auto_attached: resolutionResult.autoAttachedCount ?? 0,
      });
    }
  } catch (e) {
    await logBatchStep(
      batchId,
      "resolution",
      "failed",
      e instanceof Error ? e.message : String(e)
    );
  }

  await runPostResolutionTail(batchId, categoryId, importJobId ?? null);

  await revalidateIngestionPaths();

  const supplierOffersCreated = chunkOut.rowResults.filter((r) => r.offerCreated).length;
  const warnings: string[] = [];
  if (chunkOut.anomalyRowCount > 0) {
    warnings.push(`${chunkOut.anomalyRowCount} row(s) have anomaly flags for review`);
  }
  if (skippedLineCount && skippedLineCount > 0) {
    warnings.push(`${skippedLineCount} malformed line(s) skipped during parse`);
  }
  if (chunkOut.errors.length > 0) {
    warnings.push(`${chunkOut.errors.length} non-fatal error(s) recorded`);
  }

  const summary: BatchResultSummary = {
    totalRowsProcessed: totalRowsForSummary,
    rowsSucceeded,
    rowsFailed: totalRowsForSummary - rowsSucceeded,
    duplicatesSkipped: 0,
    canonicalProductsCreated: 0,
    supplierOffersCreated,
    warnings,
    ingestion_phase: phase,
    processing_time_ms: chunkOut.processingTimeMs,
    chunks_processed: chunkOut.chunksProcessed,
    rows_retried: chunkOut.rowsRetried,
  };

  return {
    batchId,
    supplierId,
    rawCount: rawIds.length,
    normalizedCount: rowsSucceeded,
    matchedCount: chunkOut.matchedCount,
    anomalyRowCount: chunkOut.anomalyRowCount,
    rowResults: chunkOut.rowResults,
    errors: chunkOut.errors,
    summary,
  };
}

/**
 * Recompute batch completion from DB counts (after chunked or gap resume) and run family + resolution.
 */
export async function refreshBatchCompletionAndTail(params: {
  batchId: string;
  supplierId: string;
  categoryId: string;
  totalRowsForSummary: number;
  extraErrorCount?: number;
  skippedLineCount?: number;
  processingTimeMs?: number;
  chunksProcessed?: number;
  rowsRetried?: number;
  importJobId?: string | null;
}): Promise<PipelineResult> {
  const supabase = getSupabaseCatalogos(true);
  const { count: rawCount, error: rawErr } = await supabase
    .from("supplier_products_raw")
    .select("*", { count: "exact", head: true })
    .eq("batch_id", params.batchId);
  if (rawErr) throw new Error(rawErr.message);

  const { data: norms, error: nErr } = await supabase
    .from("supplier_products_normalized")
    .select("id, master_product_id")
    .eq("batch_id", params.batchId);
  if (nErr) throw new Error(nErr.message);

  const list = norms ?? [];
  const rowsSucceeded = list.length;
  const matchedCount = list.filter((r) => r.master_product_id).length;
  const raw_count = rawCount ?? 0;
  const errN = params.extraErrorCount ?? 0;

  const phase = computeIngestionPhase({
    status: "completed",
    normalized_count: rowsSucceeded,
    raw_count,
    anomaly_row_count: 0,
    error_count: errN,
  });

  await updateBatchCompletion(params.batchId, "completed", {
    raw_count,
    normalized_count: rowsSucceeded,
    matched_count: matchedCount,
    anomaly_row_count: 0,
    error_count: errN,
    ingestion_phase: phase,
    processing_time_ms: params.processingTimeMs ?? 0,
    chunks_processed: params.chunksProcessed ?? 0,
    rows_retried: params.rowsRetried ?? 0,
    rows_failed: Math.max(0, raw_count - rowsSucceeded),
    rows_processed: rowsSucceeded,
  });

  try {
    const inferenceResult = await runFamilyInferenceForBatch(params.batchId);
    if (inferenceResult.groupedCount > 0) {
      await logBatchStep(params.batchId, "family_inference", "success", undefined, {
        updated: inferenceResult.updated,
        grouped_families: inferenceResult.groupedCount,
      });
    }
  } catch (e) {
    await logBatchStep(
      params.batchId,
      "family_inference",
      "failed",
      e instanceof Error ? e.message : String(e)
    );
  }

  try {
    const resolutionResult = await runResolutionForBatch(params.batchId);
    if (resolutionResult.candidatesCreated > 0) {
      await logBatchStep(params.batchId, "resolution", "success", undefined, {
        rows_processed: resolutionResult.rowsProcessed,
        candidates_created: resolutionResult.candidatesCreated,
        auto_attached: resolutionResult.autoAttachedCount ?? 0,
      });
    }
  } catch (e) {
    await logBatchStep(
      params.batchId,
      "resolution",
      "failed",
      e instanceof Error ? e.message : String(e)
    );
  }

  await runPostResolutionTail(params.batchId, params.categoryId, params.importJobId ?? null);

  await revalidateIngestionPaths();

  const warnings: string[] = [];
  if (params.skippedLineCount && params.skippedLineCount > 0) {
    warnings.push(`${params.skippedLineCount} malformed line(s) skipped during parse`);
  }

  const summary: BatchResultSummary = {
    totalRowsProcessed: params.totalRowsForSummary,
    rowsSucceeded,
    rowsFailed: Math.max(0, params.totalRowsForSummary - rowsSucceeded),
    duplicatesSkipped: 0,
    canonicalProductsCreated: 0,
    supplierOffersCreated: matchedCount,
    warnings,
    ingestion_phase: phase,
    processing_time_ms: params.processingTimeMs ?? 0,
    chunks_processed: params.chunksProcessed ?? 0,
    rows_retried: params.rowsRetried ?? 0,
  };

  return {
    batchId: params.batchId,
    supplierId: params.supplierId,
    rawCount: raw_count,
    normalizedCount: rowsSucceeded,
    matchedCount,
    anomalyRowCount: 0,
    rowResults: [],
    errors: [],
    summary,
  };
}

/**
 * Mark batch cancelled using current DB row counts (e.g. cooperative abort during gap resume).
 */
export async function markImportBatchCancelledFromDb(params: {
  batchId: string;
  extraErrorCount?: number;
  processingTimeMs?: number;
  chunksProcessed?: number;
  rowsRetried?: number;
}): Promise<void> {
  const supabase = getSupabaseCatalogos(true);
  const { count: rawCount, error: rawErr } = await supabase
    .from("supplier_products_raw")
    .select("*", { count: "exact", head: true })
    .eq("batch_id", params.batchId);
  if (rawErr) throw new Error(rawErr.message);

  const { data: norms, error: nErr } = await supabase
    .from("supplier_products_normalized")
    .select("id, master_product_id")
    .eq("batch_id", params.batchId);
  if (nErr) throw new Error(nErr.message);

  const list = norms ?? [];
  const rowsSucceeded = list.length;
  const matchedCount = list.filter((r) => r.master_product_id).length;
  const raw_count = rawCount ?? 0;
  const errN = params.extraErrorCount ?? 0;

  await updateBatchCompletion(params.batchId, "cancelled", {
    raw_count,
    normalized_count: rowsSucceeded,
    matched_count: matchedCount,
    anomaly_row_count: 0,
    error_count: errN,
    ingestion_phase: "cancelled",
    processing_time_ms: params.processingTimeMs ?? 0,
    chunks_processed: params.chunksProcessed ?? 0,
    rows_retried: params.rowsRetried ?? 0,
    rows_failed: Math.max(0, raw_count - rowsSucceeded),
    rows_processed: rowsSucceeded,
  });
  await revalidateIngestionPaths();
}

/**
 * Run full ingestion pipeline. Returns batch id and counts; all normalized rows are pending.
 */
export async function runPipeline(
  input: RunPipelineInput,
  options?: { chunkSize?: number }
): Promise<PipelineResult> {
  const { batchId } = await createImportBatch({
    feedId: input.feedId,
    supplierId: input.supplierId,
  });
  return runPipelineBody(batchId, input, { chunkSize: options?.chunkSize });
}

/**
 * Create batch, return immediately, run pipeline in the background (Vercel waitUntil when available).
 */
export async function startAsyncIngest(
  input: RunPipelineInput,
  options?: { chunkSize?: number }
): Promise<{ batchId: string }> {
  const { batchId } = await createImportBatch({
    feedId: input.feedId,
    supplierId: input.supplierId,
  });
  await patchImportBatchStats(batchId, { ingestion_phase: "pending", async_ingest: true });

  scheduleBackground(async () => {
    try {
      await runPipelineBody(batchId, input, { chunkSize: options?.chunkSize });
    } catch (e) {
      try {
        const { logIngestionFailure } = await import("@/lib/observability");
        logIngestionFailure(e instanceof Error ? e.message : "Async ingestion failed", {
          batch_id: batchId,
        });
      } catch {
        /* */
      }
      try {
        await updateBatchCompletion(batchId, "failed", {
          raw_count: 0,
          normalized_count: 0,
          matched_count: 0,
          anomaly_row_count: 0,
          error_count: 1,
          ingestion_phase: "failed",
          processing_time_ms: 0,
          chunks_processed: 0,
          rows_retried: 0,
          rows_failed: 0,
          rows_processed: 0,
        });
      } catch {
        /* */
      }
    }
  });

  return { batchId };
}

/**
 * Run ingestion from already-parsed rows (e.g. after AI CSV mapping + transform).
 * Skips fetch and parse; creates batch, inserts raw, then runs normalization/match/offer as usual.
 */
export async function runPipelineFromParsedRows(
  input: RunPipelineFromParsedInput
): Promise<PipelineResult> {
  const categoryId = await resolveCategoryId("disposable_gloves");
  const feedId = input.feedId ?? null;

  const { batchId } = await createImportBatch({
    feedId,
    supplierId: input.supplierId,
    sourceKind: input.sourceKind ?? "csv_upload",
    previewSessionId: input.previewSessionId ?? null,
    sourceFilename: input.sourceFilename ?? null,
  });
  await logBatchStep(
    batchId,
    "parse",
    "success",
    `Using ${input.rows.length} pre-parsed rows`
  );

  return runPipelineFromParsedBody(batchId, input, categoryId);
}

/**
 * Large CSV / mapped rows: create batch, return immediately, run normalize/match in background
 * (Vercel waitUntil when available).
 */
export async function startAsyncPipelineFromParsedRows(
  input: RunPipelineFromParsedInput
): Promise<{ batchId: string }> {
  const categoryId = await resolveCategoryId("disposable_gloves");
  const feedId = input.feedId ?? null;

  const { batchId } = await createImportBatch({
    feedId,
    supplierId: input.supplierId,
    sourceKind: input.sourceKind ?? "csv_upload",
    previewSessionId: input.previewSessionId ?? null,
    sourceFilename: input.sourceFilename ?? null,
  });

  await logBatchStep(
    batchId,
    "parse",
    "success",
    `Async pre-parsed rows: ${input.rows.length}`
  );
  await patchImportBatchStats(batchId, {
    ingestion_phase: "pending",
    async_ingest: true,
    expected_row_count: input.rows.length,
  });

  scheduleBackground(async () => {
    try {
      await runPipelineFromParsedBody(batchId, input, categoryId);
    } catch (e) {
      try {
        const { logIngestionFailure } = await import("@/lib/observability");
        logIngestionFailure(e instanceof Error ? e.message : "Async parsed ingest failed", {
          batch_id: batchId,
        });
      } catch {
        /* */
      }
      try {
        await updateBatchCompletion(batchId, "failed", {
          raw_count: 0,
          normalized_count: 0,
          matched_count: 0,
          anomaly_row_count: 0,
          error_count: 1,
          ingestion_phase: "failed",
          processing_time_ms: 0,
          chunks_processed: 0,
          rows_retried: 0,
          rows_failed: 0,
          rows_processed: 0,
        });
      } catch {
        /* */
      }
    }
  });

  return { batchId };
}
