/**
 * POST /api/csv-import/upload — Parse CSV or Excel, create preview session, optionally infer mapping.
 * Body:
 * - CSV: { csv_text, filename?, supplier_id?, infer_mapping? }
 * - Excel: { spreadsheet_base64, mime_type?, filename?, supplier_id?, infer_mapping? } (omit csv_text)
 */

import { NextResponse } from "next/server";
import { parseCsv } from "@/lib/ingestion/parsers/csv-parser";
import {
  createPreviewSession,
  updatePreviewSessionMapping,
  inferMappingFromCsv,
  findProfileByFingerprint,
  sourceFingerprint,
  transformRows,
  validateStandardizedRows,
  buildConfidenceSummary,
} from "@/lib/csv-import";
import {
  isSpreadsheetUpload,
  rowsFromXlsxBase64,
} from "@/lib/csv-import/spreadsheet-extract";

const SAMPLE_ROWS = 20;

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const csv_text = typeof body.csv_text === "string" ? body.csv_text : "";
    const spreadsheet_base64 =
      typeof body.spreadsheet_base64 === "string" ? body.spreadsheet_base64 : "";
    const mime_type = typeof body.mime_type === "string" ? body.mime_type : null;
    const filename = typeof body.filename === "string" ? body.filename : null;
    const supplier_id = body.supplier_id != null ? String(body.supplier_id) : null;
    const infer_mapping = body.infer_mapping === true;

    let headers: string[];
    let allRows: Record<string, unknown>[];
    let rowCount: number;
    let format: "csv" | "xlsx";

    if (spreadsheet_base64.trim() && isSpreadsheetUpload(filename, mime_type)) {
      let extracted;
      try {
        extracted = rowsFromXlsxBase64(spreadsheet_base64.trim());
      } catch {
        return NextResponse.json(
          { error: "Invalid spreadsheet file (could not parse xlsx/xls)" },
          { status: 400 }
        );
      }
      if (extracted.rowCount === 0 || extracted.headers.length === 0) {
        return NextResponse.json(
          { error: "Spreadsheet has no data rows or no header row" },
          { status: 400 }
        );
      }
      headers = extracted.headers;
      allRows = extracted.rows;
      rowCount = extracted.rowCount;
      format = "xlsx";
    } else {
      if (!csv_text.trim()) {
        return NextResponse.json(
          { error: "csv_text is required (or spreadsheet_base64 + xlsx/xls filename/mime)" },
          { status: 400 }
        );
      }
      const delimiter = csv_text.includes("\t") ? "\t" : ",";
      const parsed = parseCsv(csv_text, delimiter);
      if (parsed.rows.length === 0) {
        return NextResponse.json(
          { error: "CSV has no data rows (only headers or empty)" },
          { status: 400 }
        );
      }
      headers = Object.keys(parsed.rows[0] ?? {});
      allRows = parsed.rows as Record<string, unknown>[];
      rowCount = parsed.rowCount;
      format = "csv";
    }
    if (headers.length === 0) {
      return NextResponse.json({ error: "No columns detected" }, { status: 400 });
    }

    const sampleRows = allRows.slice(0, SAMPLE_ROWS).map((r) => r as Record<string, unknown>);

    const { id: sessionId } = await createPreviewSession({
      supplierId: supplier_id,
      filename,
      headers,
      sampleRows,
    });

    let inferred = null;
    const fingerprint = sourceFingerprint(headers, supplier_id);
    const existingProfile = await findProfileByFingerprint(fingerprint, supplier_id);

    if (infer_mapping) {
      const mappings = existingProfile?.fields ?? null;
      if (mappings && mappings.length > 0) {
        inferred = {
          mappings,
          unmapped_columns: headers.filter((h) => !mappings.some((m) => m.source_column === h)),
          average_confidence: mappings.reduce((a, m) => a + m.confidence, 0) / mappings.length,
          warnings: [],
        };
      } else {
        const aiResult = await inferMappingFromCsv(headers, sampleRows);
        if (aiResult) inferred = aiResult;
      }
      if (inferred) {
        const rowsToValidate = transformRows(sampleRows, inferred.mappings);
        const validationSummary = validateStandardizedRows(rowsToValidate);
        const confidenceSummary = buildConfidenceSummary(inferred.mappings, sampleRows, 0.7);
        await updatePreviewSessionMapping(
          sessionId,
          inferred,
          validationSummary,
          confidenceSummary
        );
      }
    }

    const { getPreviewSession } = await import("@/lib/csv-import/preview-session-service");
    const session = await getPreviewSession(sessionId);
    const profileReused = infer_mapping && !!existingProfile?.fields?.length;
    return NextResponse.json({
      sessionId,
      headers,
      sampleRows,
      rowCount,
      format,
      inferredMapping: inferred ?? session?.inferred_mapping_json ?? null,
      validationSummary: session?.validation_summary_json ?? null,
      confidenceSummary: session?.confidence_summary_json ?? null,
      profileReused,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed" },
      { status: 500 }
    );
  }
}
