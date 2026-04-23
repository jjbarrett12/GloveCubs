/**
 * POST /api/csv-import/import — Run import with full CSV and session mapping.
 * Body: { session_id: string, csv_text: string, supplier_id: string }
 */

import { NextResponse } from "next/server";
import { parseCsv } from "@/lib/ingestion/parsers/csv-parser";
import { getPreviewSession } from "@/lib/csv-import/preview-session-service";
import {
  transformRows,
  validateStandardizedRows,
  setPreviewSessionStatus,
} from "@/lib/csv-import";
import { runPipelineFromParsedRows } from "@/lib/ingestion/run-pipeline";
import { INGESTION_MAX_FEED_ROWS } from "@/lib/ingestion/ingestion-config";

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const session_id = typeof body.session_id === "string" ? body.session_id : "";
    const csv_text = typeof body.csv_text === "string" ? body.csv_text : "";
    const supplier_id = typeof body.supplier_id === "string" ? body.supplier_id : "";
    const filename = typeof body.filename === "string" ? body.filename : null;

    if (!session_id || !csv_text || !supplier_id) {
      return NextResponse.json(
        { error: "session_id, csv_text, and supplier_id are required" },
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

    const delimiter = csv_text.includes("\t") ? "\t" : ",";
    const parsed = parseCsv(csv_text, delimiter);
    const sourceRows = parsed.rows.slice(0, INGESTION_MAX_FEED_ROWS) as Record<string, unknown>[];
    const standardized = transformRows(sourceRows, mapping.mappings);
    const validation = validateStandardizedRows(standardized);
    if (validation.invalid_count > 0 && validation.invalid_count === standardized.length) {
      return NextResponse.json(
        {
          error: "All rows failed validation",
          validationSummary: validation,
        },
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
      feedId: null,
      rows: rowsToImport,
      previewSessionId: session_id,
      sourceFilename: filename,
      sourceKind: "csv_upload",
    });

    await setPreviewSessionStatus(session_id, "imported");

    return NextResponse.json({
      batchId: result.batchId,
      ...result.summary,
      validationSummary: validation,
      rowsImported: rowsToImport.length,
      rowsSkipped: standardized.length - rowsToImport.length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Import failed" },
      { status: 500 }
    );
  }
}
