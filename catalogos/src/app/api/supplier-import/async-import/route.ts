/**
 * POST /api/supplier-import/async-import
 * Large supplier CSV: return batchId immediately; parse/transform/ingest in background (waitUntil when available).
 *
 * Body: { session_id, supplier_id, csv_text | spreadsheet_base64 + mime/filename, filename?, sync?: boolean }
 * - sync: true → same as /api/csv-import/import (blocking, up to maxDuration).
 */

import { NextResponse } from "next/server";
import { parseCsv } from "@/lib/ingestion/parsers/csv-parser";
import {
  isSpreadsheetUpload,
  rowsFromXlsxBase64,
} from "@/lib/csv-import/spreadsheet-extract";
import { getPreviewSession } from "@/lib/csv-import/preview-session-service";
import {
  transformRows,
  validateStandardizedRows,
  setPreviewSessionStatus,
} from "@/lib/csv-import";
import { runPipelineFromParsedRows } from "@/lib/ingestion/run-pipeline";
import { startAsyncCsvImportFromSession } from "@/lib/ingestion/csv-async-import";
import { INGESTION_MAX_FEED_ROWS } from "@/lib/ingestion/ingestion-config";

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const session_id = typeof body.session_id === "string" ? body.session_id : "";
    const csv_text = typeof body.csv_text === "string" ? body.csv_text : "";
    const spreadsheet_base64 =
      typeof body.spreadsheet_base64 === "string" ? body.spreadsheet_base64 : "";
    const mime_type = typeof body.mime_type === "string" ? body.mime_type : null;
    const supplier_id = typeof body.supplier_id === "string" ? body.supplier_id : "";
    const filename = typeof body.filename === "string" ? body.filename : null;
    const sync = body.sync === true;

    const hasSpreadsheet =
      spreadsheet_base64.trim().length > 0 && isSpreadsheetUpload(filename, mime_type);
    if (!session_id || !supplier_id || (!csv_text.trim() && !hasSpreadsheet)) {
      return NextResponse.json(
        {
          error:
            "session_id, supplier_id, and csv_text (or spreadsheet_base64 for xlsx/xls) are required",
        },
        { status: 400 }
      );
    }

    const session = await getPreviewSession(session_id);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    const mapping = session.inferred_mapping_json;
    if (!mapping?.mappings?.length) {
      return NextResponse.json(
        { error: "No mapping on session; run infer first" },
        { status: 400 }
      );
    }

    if (!sync) {
      const { batchId } = await startAsyncCsvImportFromSession({
        supplierId: supplier_id,
        previewSessionId: session_id,
        csvText: hasSpreadsheet ? "" : csv_text,
        spreadsheetBase64: hasSpreadsheet ? spreadsheet_base64.trim() : null,
        spreadsheetFilename: hasSpreadsheet ? filename : null,
        spreadsheetMime: hasSpreadsheet ? mime_type : null,
        sourceFilename: filename,
      });
      return NextResponse.json(
        {
          batchId,
          async: true,
          message: "Import queued; poll GET /api/supplier-import/batches/{batchId}/status",
          maxRows: INGESTION_MAX_FEED_ROWS,
        },
        { status: 202 }
      );
    }

    let sourceRows: Record<string, unknown>[];
    if (hasSpreadsheet) {
      const extracted = rowsFromXlsxBase64(spreadsheet_base64.trim());
      sourceRows = extracted.rows.slice(0, INGESTION_MAX_FEED_ROWS) as Record<string, unknown>[];
    } else {
      const delimiter = csv_text.includes("\t") ? "\t" : ",";
      const parsed = parseCsv(csv_text, delimiter);
      sourceRows = parsed.rows.slice(0, INGESTION_MAX_FEED_ROWS) as Record<string, unknown>[];
    }
    const standardized = transformRows(sourceRows, mapping.mappings);
    const validation = validateStandardizedRows(standardized);
    if (validation.invalid_count > 0 && validation.invalid_count === standardized.length) {
      return NextResponse.json(
        { error: "All rows failed validation", validationSummary: validation },
        { status: 400 }
      );
    }

    const rowsToImport = standardized.filter((_, i) => {
      const errs = validation.row_errors.find((e) => e.row_index === i);
      return !errs || errs.messages.length === 0;
    });
    if (rowsToImport.length === 0) {
      return NextResponse.json(
        { error: "No valid rows after validation", validationSummary: validation },
        { status: 400 }
      );
    }

    const result = await runPipelineFromParsedRows({
      supplierId: supplier_id,
      rows: rowsToImport,
      previewSessionId: session_id,
      sourceFilename: filename,
      sourceKind: hasSpreadsheet ? "excel" : "csv_upload",
    });

    await setPreviewSessionStatus(session_id, "imported");

    return NextResponse.json({
      batchId: result.batchId,
      async: false,
      ...result.summary,
      validationSummary: validation,
      rowsImported: rowsToImport.length,
      rowsSkipped: standardized.length - rowsToImport.length,
    }    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Import failed" },
      { status: 500 }
    );
  }
}
