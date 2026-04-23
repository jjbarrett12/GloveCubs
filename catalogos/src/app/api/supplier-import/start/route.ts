/**
 * POST /api/supplier-import/start
 * Queues a resumable supplier import job (chunked pipeline + supplier_import_jobs row).
 *
 * Auth: CATALOGOS_ADMIN_SECRET (Bearer or catalogos_admin cookie) when configured.
 * Scope: X-Catalogos-Organization-Id (required). Optional X-Catalogos-Operator-Id for audit.
 *
 * Body: session_id, supplier_id, organization_id? (must match header if sent), csv_text | spreadsheet…
 */

import { NextResponse } from "next/server";
import { startSupplierImportJobAndSchedule } from "@/lib/supplier-import-job/runner";
import { getSupplierImportJob, toPublicJob } from "@/lib/supplier-import-job/service";
import { getPreviewSession } from "@/lib/csv-import/preview-session-service";
import { isSpreadsheetUpload } from "@/lib/csv-import/spreadsheet-extract";
import { INGESTION_MAX_FEED_ROWS } from "@/lib/ingestion/ingestion-config";
import { requireSupplierImportAuth, isValidUuid } from "@/lib/supplier-import-job/catalogos-api-auth";
import { assertSupplierInOrganization } from "@/lib/supplier-import-job/supplier-import-access";
import { logSupplierImportSensitiveAction } from "@/lib/supplier-import-job/audit-log";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const auth = requireSupplierImportAuth(req);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json().catch(() => ({}));
    const session_id = typeof body.session_id === "string" ? body.session_id : "";
    const csv_text = typeof body.csv_text === "string" ? body.csv_text : "";
    const spreadsheet_base64 =
      typeof body.spreadsheet_base64 === "string" ? body.spreadsheet_base64 : "";
    const mime_type = typeof body.mime_type === "string" ? body.mime_type : null;
    const supplier_id = typeof body.supplier_id === "string" ? body.supplier_id : "";
    const body_org =
      typeof body.organization_id === "string" && isValidUuid(body.organization_id)
        ? body.organization_id
        : null;
    if (body_org && body_org !== auth.organizationId) {
      return NextResponse.json(
        { error: "Forbidden", detail: "Body organization_id must match X-Catalogos-Organization-Id" },
        { status: 403 }
      );
    }
    const filename = typeof body.filename === "string" ? body.filename : null;
    const file_path = typeof body.file_path === "string" ? body.file_path : null;
    const chunk_size =
      typeof body.chunk_size === "number" && body.chunk_size >= 50 && body.chunk_size <= 2000
        ? Math.floor(body.chunk_size)
        : undefined;

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

    const supplierDenied = await assertSupplierInOrganization(supplier_id, auth.organizationId);
    if (supplierDenied) return supplierDenied;

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

    const { jobId, batchId } = await startSupplierImportJobAndSchedule({
      supplierId: supplier_id,
      organizationId: auth.organizationId,
      previewSessionId: session_id,
      csvText: hasSpreadsheet ? "" : csv_text,
      spreadsheetBase64: hasSpreadsheet ? spreadsheet_base64.trim() : null,
      spreadsheetFilename: hasSpreadsheet ? filename : null,
      spreadsheetMime: hasSpreadsheet ? mime_type : null,
      sourceFilename: filename,
      filePath: file_path ?? filename,
      chunkSize: chunk_size,
    });

    const job = await getSupplierImportJob(jobId);

    await logSupplierImportSensitiveAction({
      action: "start",
      jobId,
      batchId,
      organizationId: auth.organizationId,
      operatorId: auth.operatorId,
      detail: { supplier_id, preview_session_id: session_id },
    });

    return NextResponse.json(
      {
        jobId,
        batchId,
        job: job ? toPublicJob(job) : null,
        async: true,
        message: "Import job queued; poll GET /api/supplier-import/jobs/{jobId}",
        maxRows: INGESTION_MAX_FEED_ROWS,
      },
      { status: 202 }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Start job failed" },
      { status: 500 }
    );
  }
}
