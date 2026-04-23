/**
 * POST /api/supplier-import/jobs/{id}/resume
 */

import { NextResponse } from "next/server";
import { resumeSupplierImportJob } from "@/lib/supplier-import-job/runner";
import { requireSupplierImportAuth } from "@/lib/supplier-import-job/catalogos-api-auth";
import { loadJobForOrgScope } from "@/lib/supplier-import-job/route-guards";
import { logSupplierImportSensitiveAction } from "@/lib/supplier-import-job/audit-log";

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

    await logSupplierImportSensitiveAction({
      action: "resume",
      jobId: id,
      batchId: scoped.job.batch_id,
      organizationId: auth.organizationId,
      operatorId: auth.operatorId,
      detail: {
        failed_stage: (scoped.job.resume_cursor as Record<string, unknown> | null)?.failed_stage,
      },
    });

    await resumeSupplierImportJob(id);
    return NextResponse.json({ ok: true, jobId: id, message: "Resume scheduled" }, { status: 202 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Resume failed";
    const status = msg.includes("Only failed") || msg.includes("no batch") ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
