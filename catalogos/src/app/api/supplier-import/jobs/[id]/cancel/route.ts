/**
 * POST /api/supplier-import/jobs/{id}/cancel
 */

import { NextResponse } from "next/server";
import { requestCancelSupplierImportJob } from "@/lib/supplier-import-job/runner";
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
      action: "cancel",
      jobId: id,
      batchId: scoped.job.batch_id,
      organizationId: auth.organizationId,
      operatorId: auth.operatorId,
    });

    await requestCancelSupplierImportJob(id);
    return NextResponse.json({ ok: true, jobId: id, message: "Cancel requested" });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Cancel failed" },
      { status: 500 }
    );
  }
}
