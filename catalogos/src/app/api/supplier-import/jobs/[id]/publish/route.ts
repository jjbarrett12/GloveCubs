/**
 * POST /api/supplier-import/jobs/{id}/publish
 */

import { NextResponse } from "next/server";
import { startSupplierImportPublishAndSchedule } from "@/lib/supplier-import-job/runner";
import { requireSupplierImportAuth } from "@/lib/supplier-import-job/catalogos-api-auth";
import { loadJobForOrgScope } from "@/lib/supplier-import-job/route-guards";
import { logSupplierImportSensitiveAction } from "@/lib/supplier-import-job/audit-log";

export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = requireSupplierImportAuth(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing job id" }, { status: 400 });
    }

    const scoped = await loadJobForOrgScope(id, auth.organizationId);
    if (scoped instanceof NextResponse) return scoped;
    const job = scoped.job;

    const body = await req.json().catch(() => ({}));
    const published_by =
      typeof body.published_by === "string" ? body.published_by : auth.operatorId;
    const chunk_size =
      typeof body.chunk_size === "number" && body.chunk_size >= 5 && body.chunk_size <= 200
        ? Math.floor(body.chunk_size)
        : undefined;

    if (job.status === "publishing") {
      return NextResponse.json(
        { error: "Publish already in progress", job_id: id },
        { status: 409 }
      );
    }

    if (job.status === "published") {
      return NextResponse.json(
        { error: "Job already published; create a new import for additional rows", job_id: id },
        { status: 400 }
      );
    }

    const rc = job.resume_cursor as Record<string, unknown> | null;
    const publishFailed = job.status === "failed" && rc?.failed_stage === "publish";
    const canPublish = job.status === "approved" || publishFailed;

    if (!canPublish) {
      return NextResponse.json(
        {
          error:
            "Job must be approved (POST …/approve with confirm_batch) or failed during publish to retry",
          current_status: job.status,
        },
        { status: 400 }
      );
    }

    await logSupplierImportSensitiveAction({
      action: "publish",
      jobId: id,
      batchId: job.batch_id,
      organizationId: auth.organizationId,
      operatorId: auth.operatorId,
      detail: { published_by, chunk_size },
    });

    startSupplierImportPublishAndSchedule({
      jobId: id,
      publishedBy: published_by,
      chunkSize: chunk_size,
    });

    return NextResponse.json(
      {
        ok: true,
        job_id: id,
        async: true,
        message: "Publish queued; poll GET /api/supplier-import/jobs/{id}",
      },
      { status: 202 }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Publish failed" },
      { status: 500 }
    );
  }
}
