/**
 * Large supplier CSV: create batch immediately, parse/transform inside background work
 * so the HTTP handler returns quickly with a batchId to poll.
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
  createImportBatch,
  logBatchStep,
  patchImportBatchStats,
  updateBatchCompletion,
} from "./batch-service";
import { runPipelineFromParsedBody } from "./run-pipeline";
import { INGESTION_MAX_FEED_ROWS } from "./ingestion-config";

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
  const { getSupabaseCatalogos } = await import("@/lib/db/client");
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase.from("categories").select("id").eq("slug", slug).single();
  if (error || !data?.id) throw new Error(`Category not found: ${slug}`);
  return data.id as string;
}

export interface StartAsyncCsvImportFromSessionInput {
  supplierId: string;
  previewSessionId: string;
  /** Raw CSV/TSV text when not using spreadsheetBase64 */
  csvText: string;
  /** Base64 workbook body for xlsx/xls (same mapping session as CSV) */
  spreadsheetBase64?: string | null;
  spreadsheetFilename?: string | null;
  spreadsheetMime?: string | null;
  sourceFilename?: string | null;
}

/**
 * Validates session synchronously; enqueues parse → raw → normalize for large files.
 */
export async function startAsyncCsvImportFromSession(
  input: StartAsyncCsvImportFromSessionInput
): Promise<{ batchId: string }> {
  const session = await getPreviewSession(input.previewSessionId);
  if (!session) throw new Error("Session not found");
  const mapping = session.inferred_mapping_json as { mappings?: FieldMappingItem[] } | null;
  if (!mapping?.mappings?.length) throw new Error("No mapping on session; run infer first");
  const fieldMappings = mapping.mappings;

  const categoryId = await resolveCategoryId("disposable_gloves");

  const { batchId } = await createImportBatch({
    feedId: null,
    supplierId: input.supplierId,
    sourceKind: "csv_upload",
    previewSessionId: input.previewSessionId,
    sourceFilename: input.sourceFilename ?? null,
  });

  await logBatchStep(batchId, "parse", "started", "Queued async CSV parse/transform");
  await patchImportBatchStats(batchId, {
    ingestion_phase: "queued",
    async_ingest: true,
  });

  const csvText = input.csvText;
  const supplierId = input.supplierId;
  const previewSessionId = input.previewSessionId;
  const sourceFilename = input.sourceFilename ?? null;
  const sheetB64 = input.spreadsheetBase64?.trim() ?? "";
  const useSheet =
    sheetB64.length > 0 &&
    isSpreadsheetUpload(input.spreadsheetFilename ?? sourceFilename, input.spreadsheetMime ?? null);

  scheduleBackground(async () => {
    try {
      let sourceRows: Record<string, unknown>[];
      if (useSheet) {
        const extracted = rowsFromXlsxBase64(sheetB64);
        sourceRows = extracted.rows as Record<string, unknown>[];
      } else {
        const delimiter = csvText.includes("\t") ? "\t" : ",";
        const parsed = parseCsv(csvText, delimiter);
        sourceRows = parsed.rows as Record<string, unknown>[];
      }
      if (sourceRows.length > INGESTION_MAX_FEED_ROWS) {
        sourceRows = sourceRows.slice(0, INGESTION_MAX_FEED_ROWS);
      }
      const standardized = transformRows(sourceRows, fieldMappings);

      await runPipelineFromParsedBody(
        batchId,
        {
          supplierId,
          rows: standardized,
          previewSessionId,
          sourceFilename,
          sourceKind: useSheet ? "excel" : "csv_upload",
        },
        categoryId
      );
    } catch (e) {
      try {
        const { logIngestionFailure } = await import("@/lib/observability");
        logIngestionFailure(e instanceof Error ? e.message : "Async CSV import failed", {
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
