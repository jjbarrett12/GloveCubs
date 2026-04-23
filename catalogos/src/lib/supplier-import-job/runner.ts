/**
 * Background worker: chunked import with supplier_import_jobs progress + cancel + resume.
 */

import { parseCsv } from "@/lib/ingestion/parsers/csv-parser";
import {
  isSpreadsheetUpload,
  rowsFromXlsxBase64,
} from "@/lib/csv-import/spreadsheet-extract";
import { getPreviewSession } from "@/lib/csv-import/preview-session-service";
import { transformRows } from "@/lib/csv-import/transform";
import type { FieldMappingItem } from "@/lib/csv-import/types";
import {
  fetchExistingRawExternalIds,
  insertRawRows,
  listRawRowsOrderedForBatch,
} from "@/lib/ingestion/raw-service";
import {
  finalizeAfterRawRows,
  markImportBatchCancelledFromDb,
  refreshBatchCompletionAndTail,
} from "@/lib/ingestion/run-pipeline";
import { runNormalizationGapsForBatch } from "@/lib/ingestion/normalize-gaps";
import {
  INGESTION_CHUNK_SIZE_DEFAULT,
  INGESTION_MAX_FEED_ROWS,
} from "@/lib/ingestion/ingestion-config";
import { getSupabaseCatalogos } from "@/lib/db/client";
import { createImportBatch, type ImportBatchSourceKind } from "@/lib/ingestion/batch-service";
import {
  appendSupplierImportJobError,
  getSupplierImportJob,
  insertSupplierImportJob,
  patchSupplierImportJob,
} from "./service";
import { runSupplierImportPublishWorker } from "./publish-worker";
import { scheduleDeferredAiMatchingAfterIngest } from "@/lib/ingestion/deferred-ai-matching-worker";

function scheduleBackground(fn: () => Promise<void>): void {
  void (async () => {
    try {
      const mod = await import("@vercel/functions");
      if (typeof mod.waitUntil === "function") {
        mod.waitUntil(fn());
        return;
      }
    } catch {
      /* */
    }
    void fn();
  })();
}

async function resolveCategoryId(slug: string): Promise<string> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase.from("categories").select("id").eq("slug", slug).single();
  if (error || !data?.id) throw new Error(`Category not found: ${slug}`);
  return data.id as string;
}

export interface StartSupplierImportJobInput {
  supplierId: string;
  organizationId?: string | null;
  previewSessionId: string;
  csvText?: string;
  spreadsheetBase64?: string | null;
  spreadsheetFilename?: string | null;
  spreadsheetMime?: string | null;
  sourceFilename?: string | null;
  filePath?: string | null;
  chunkSize?: number;
}

/**
 * Creates import_batches row + supplier_import_jobs row and schedules the worker
 * (same payload model as async CSV import: body held in closure until worker runs).
 */
export async function startSupplierImportJobAndSchedule(
  input: StartSupplierImportJobInput
): Promise<{ jobId: string; batchId: string }> {
  const hasSpreadsheet =
    Boolean(input.spreadsheetBase64?.trim()) &&
    isSpreadsheetUpload(input.spreadsheetFilename ?? input.sourceFilename, input.spreadsheetMime ?? null);
  const sourceKind: ImportBatchSourceKind = hasSpreadsheet ? "excel" : "csv_upload";

  const { batchId } = await createImportBatch({
    feedId: null,
    supplierId: input.supplierId,
    sourceKind,
    previewSessionId: input.previewSessionId,
    sourceFilename: input.sourceFilename ?? null,
  });

  const jobRow = await insertSupplierImportJob({
    organizationId: input.organizationId,
    supplierId: input.supplierId,
    batchId,
    previewSessionId: input.previewSessionId,
    filePath: input.filePath ?? input.sourceFilename ?? null,
    fileType: hasSpreadsheet ? input.spreadsheetMime ?? "spreadsheet" : "csv",
  });

  const payload = {
    csvText: input.csvText ?? "",
    spreadsheetBase64: input.spreadsheetBase64?.trim() ?? "",
    spreadsheetFilename: input.spreadsheetFilename ?? input.sourceFilename,
    spreadsheetMime: input.spreadsheetMime,
    sourceFilename: input.sourceFilename,
    chunkSize: input.chunkSize ?? INGESTION_CHUNK_SIZE_DEFAULT,
  };

  scheduleBackground(() =>
    runSupplierImportJobWorker(jobRow.id, batchId, input.supplierId, payload)
  );

  return { jobId: jobRow.id, batchId };
}

type WorkerPayload = {
  csvText: string;
  spreadsheetBase64: string;
  spreadsheetFilename: string | null | undefined;
  spreadsheetMime: string | null | undefined;
  sourceFilename: string | null | undefined;
  chunkSize: number;
};

async function isJobCancelled(jobId: string): Promise<boolean> {
  const j = await getSupplierImportJob(jobId);
  return Boolean(j?.cancel_requested_at);
}

export async function runSupplierImportJobWorker(
  jobId: string,
  batchId: string,
  supplierId: string,
  payload: WorkerPayload
): Promise<void> {
  const now = () => new Date().toISOString();

  try {
    const job = await getSupplierImportJob(jobId);
    if (!job) return;
    if (job.cancel_requested_at) {
      await patchSupplierImportJob(jobId, {
        status: "cancelled",
        completed_at: now(),
        current_stage: "Cancelled",
      });
      return;
    }

    if (job.status === "failed") {
      await resumeFailedJobNormalizeGaps(jobId, batchId, supplierId, payload.chunkSize);
      return;
    }

    await patchSupplierImportJob(jobId, {
      status: "parsing",
      started_at: job.started_at ?? now(),
      current_stage: "Parsing file",
      stats: { phase: "parsing" },
    });

    const session = await getPreviewSession(job.preview_session_id ?? "");
    if (!session) throw new Error("Preview session not found");
    const mapping = session.inferred_mapping_json as { mappings?: FieldMappingItem[] } | null;
    if (!mapping?.mappings?.length) throw new Error("No mapping on session");

    const useSheet =
      payload.spreadsheetBase64.length > 0 &&
      isSpreadsheetUpload(payload.spreadsheetFilename ?? null, payload.spreadsheetMime ?? null);

    let sourceRows: Record<string, unknown>[];
    if (useSheet) {
      const extracted = rowsFromXlsxBase64(payload.spreadsheetBase64);
      sourceRows = extracted.rows as Record<string, unknown>[];
    } else {
      const delimiter = payload.csvText.includes("\t") ? "\t" : ",";
      const parsed = parseCsv(payload.csvText, delimiter);
      sourceRows = parsed.rows as Record<string, unknown>[];
    }

    if (sourceRows.length > INGESTION_MAX_FEED_ROWS) {
      sourceRows = sourceRows.slice(0, INGESTION_MAX_FEED_ROWS);
    }

    const standardized = transformRows(sourceRows, mapping.mappings);

    await patchSupplierImportJob(jobId, {
      total_rows: standardized.length,
      current_stage: "Writing raw rows",
      resume_cursor: { parse_completed: true, row_count: standardized.length },
    });

    const skipIds = await fetchExistingRawExternalIds(batchId);
    const errors: string[] = [];
    await insertRawRows({
      batchId,
      supplierId,
      rows: standardized as import("@/lib/ingestion/types").ParsedRow[],
      skipExternalIds: skipIds,
    });

    const { rawIds, parsedRows } = await listRawRowsOrderedForBatch(batchId);
    if (rawIds.length === 0) throw new Error("No raw rows after parse");

    await patchSupplierImportJob(jobId, {
      status: "normalizing",
      total_rows: Math.max(job.total_rows, rawIds.length),
      current_stage: "Normalizing and matching",
      stats: { phase: "normalizing", chunks_total: Math.ceil(rawIds.length / payload.chunkSize) },
    });

    const categoryId = await resolveCategoryId("disposable_gloves");

    const pipelineResult = await finalizeAfterRawRows({
      batchId,
      supplierId,
      categoryId,
      rawIds,
      parsedRows,
      errors,
      chunkSize: payload.chunkSize,
      totalRowsForSummary: standardized.length,
      importJobId: jobId,
      onChunkComplete: async ({ rowsProcessedSoFar, chunksTotal }) => {
        await patchSupplierImportJob(jobId, {
          processed_rows: rowsProcessedSoFar,
          status: rowsProcessedSoFar < rawIds.length ? "normalizing" : "variant_grouping",
          current_stage:
            rowsProcessedSoFar < rawIds.length ? "Normalizing and matching" : "Variant grouping",
          stats: {
            percent_complete: Math.min(99, Math.round((100 * rowsProcessedSoFar) / Math.max(rawIds.length, 1))),
            chunks_total: chunksTotal,
            phase: rowsProcessedSoFar < rawIds.length ? "normalizing" : "variant_grouping",
          },
        });
      },
      shouldAbort: () => isJobCancelled(jobId),
    });

    if (pipelineResult.aborted || (await isJobCancelled(jobId))) {
      const refreshed = await getSupplierImportJob(jobId);
      const processed = Math.max(
        pipelineResult.normalizedCount,
        refreshed?.processed_rows ?? 0
      );
      const total = Math.max(
        rawIds.length,
        refreshed?.total_rows ?? 0,
        standardized.length
      );
      await patchSupplierImportJob(jobId, {
        status: "cancelled",
        completed_at: now(),
        processed_rows: processed,
        current_stage: "Cancelled during processing",
        stats: {
          phase: "cancelled",
          percent_complete: total > 0 ? Math.min(100, Math.round((100 * processed) / total)) : 0,
        },
      });
      return;
    }

    await patchSupplierImportJob(jobId, {
      status: "ready_for_review",
      processed_rows: rawIds.length,
      completed_at: null,
      current_stage: "Ready for review",
      stats: {
        phase: "ready_for_review",
        percent_complete: 100,
      },
    });

    scheduleDeferredAiMatchingAfterIngest(batchId, jobId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await appendSupplierImportJobError(jobId, { stage: "worker", message: msg });
    await patchSupplierImportJob(jobId, {
      status: "failed",
      completed_at: now(),
      current_stage: "Failed",
      resume_cursor: { last_error: msg, failed_at: now(), failed_stage: "ingest" },
    });
  }
}

/**
 * Resume after failure: fill any raw rows missing normalized staging, refresh batch stats, run family tail.
 */
export async function resumeFailedJobNormalizeGaps(
  jobId: string,
  batchId: string,
  supplierId: string,
  chunkSize: number = INGESTION_CHUNK_SIZE_DEFAULT
): Promise<void> {
  const now = () => new Date().toISOString();
  const job = await getSupplierImportJob(jobId);
  if (!job) return;
  if (job.cancel_requested_at) {
    await patchSupplierImportJob(jobId, { status: "cancelled", completed_at: now(), current_stage: "Cancelled" });
    return;
  }

  const errors: string[] = [];
  try {
    await patchSupplierImportJob(jobId, {
      status: "normalizing",
      current_stage: "Resuming normalize/match (gap fill)",
      resume_cursor: { ...job.resume_cursor, resume_mode: "normalize_gaps" },
    });

    const categoryId = await resolveCategoryId("disposable_gloves");
    const gapOut = await runNormalizationGapsForBatch({
      batchId,
      supplierId,
      categoryId,
      chunkSize,
      errors,
      shouldAbort: () => isJobCancelled(jobId),
    });

    if (gapOut.aborted || (await isJobCancelled(jobId))) {
      await markImportBatchCancelledFromDb({
        batchId,
        extraErrorCount: errors.length,
        processingTimeMs: gapOut.processingTimeMs,
        chunksProcessed: gapOut.chunksProcessed,
        rowsRetried: gapOut.rowsRetried,
      });
      const supabase = getSupabaseCatalogos(true);
      const { count: normCount } = await supabase
        .from("supplier_products_normalized")
        .select("*", { count: "exact", head: true })
        .eq("batch_id", batchId);
      const n = normCount ?? 0;
      const total = Math.max(job.total_rows || 0, n);
      await patchSupplierImportJob(jobId, {
        status: "cancelled",
        completed_at: now(),
        processed_rows: n,
        current_stage: "Cancelled during resume",
        stats: {
          phase: "cancelled",
          percent_complete: total > 0 ? Math.min(100, Math.round((100 * n) / total)) : 0,
        },
      });
      return;
    }

    await refreshBatchCompletionAndTail({
      batchId,
      supplierId,
      categoryId,
      totalRowsForSummary: job.total_rows || 0,
      extraErrorCount: errors.length,
      processingTimeMs: gapOut.processingTimeMs,
      chunksProcessed: gapOut.chunksProcessed,
      rowsRetried: gapOut.rowsRetried,
      importJobId: jobId,
    });

    const { rawIds } = await listRawRowsOrderedForBatch(batchId);

    await patchSupplierImportJob(jobId, {
      status: "ready_for_review",
      processed_rows: rawIds.length,
      completed_at: null,
      current_stage: "Ready for review",
      stats: { phase: "ready_for_review", percent_complete: 100 },
    });

    scheduleDeferredAiMatchingAfterIngest(batchId, jobId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await appendSupplierImportJobError(jobId, { stage: "resume", message: msg });
    await patchSupplierImportJob(jobId, {
      status: "failed",
      current_stage: "Resume failed",
      completed_at: now(),
    });
  }
}

export async function requestCancelSupplierImportJob(jobId: string): Promise<void> {
  await patchSupplierImportJob(jobId, {
    cancel_requested_at: new Date().toISOString(),
    current_stage: "Cancel requested",
  });
}

export async function resumeSupplierImportJob(jobId: string): Promise<void> {
  const job = await getSupplierImportJob(jobId);
  if (!job?.batch_id) throw new Error("Job has no batch");
  if (job.status !== "failed") {
    throw new Error("Only failed import jobs can be resumed");
  }
  const rc = job.resume_cursor as Record<string, unknown> | null;
  if (rc?.failed_stage === "publish") {
    scheduleBackground(() =>
      runSupplierImportPublishWorker({
        jobId,
        shouldAbort: () => isJobCancelled(jobId),
      })
    );
    return;
  }
  scheduleBackground(() =>
    resumeFailedJobNormalizeGaps(jobId, job.batch_id!, job.supplier_id, INGESTION_CHUNK_SIZE_DEFAULT)
  );
}

export interface StartSupplierImportPublishInput {
  jobId: string;
  publishedBy?: string | null;
  chunkSize?: number;
}

/**
 * Queues chunked publish worker (idempotent; skips rows already in publish_events).
 */
export function startSupplierImportPublishAndSchedule(input: StartSupplierImportPublishInput): void {
  scheduleBackground(() =>
    runSupplierImportPublishWorker({
      jobId: input.jobId,
      publishedBy: input.publishedBy,
      chunkSize: input.chunkSize,
      shouldAbort: () => isJobCancelled(input.jobId),
    })
  );
}
