/**
 * POST /api/csv-import/preview/[id]/infer — Run AI mapping for existing session.
 */

import { NextResponse } from "next/server";
import { getPreviewSession } from "@/lib/csv-import/preview-session-service";
import {
  inferMappingFromCsv,
  updatePreviewSessionMapping,
  transformRows,
  validateStandardizedRows,
  buildConfidenceSummary,
} from "@/lib/csv-import";

export const maxDuration = 30;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getPreviewSession(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    const headers = session.headers_json ?? [];
    const sampleRows = (session.sample_rows_json ?? []) as Record<string, unknown>[];
    if (headers.length === 0 || sampleRows.length === 0) {
      return NextResponse.json(
        { error: "Session has no headers or sample rows" },
        { status: 400 }
      );
    }

    const inferred = await inferMappingFromCsv(headers, sampleRows);
    if (!inferred) {
      return NextResponse.json(
        { error: "AI mapping failed (check OPENAI_API_KEY)" },
        { status: 502 }
      );
    }

    const rowsToValidate = transformRows(sampleRows, inferred.mappings);
    const validationSummary = validateStandardizedRows(rowsToValidate);
    const confidenceSummary = buildConfidenceSummary(
      inferred.mappings,
      sampleRows,
      0.7
    );
    await updatePreviewSessionMapping(
      id,
      inferred,
      validationSummary,
      confidenceSummary
    );

    return NextResponse.json({
      inferredMapping: inferred,
      validationSummary,
      confidenceSummary,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Infer failed" },
      { status: 500 }
    );
  }
}
