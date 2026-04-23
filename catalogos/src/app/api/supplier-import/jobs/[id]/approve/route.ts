/**
 * POST /api/supplier-import/jobs/{id}/approve
 */

import { NextResponse } from "next/server";
import { approveSupplierImportJobActions } from "@/lib/supplier-import-job/approve-job";
import { requireSupplierImportAuth } from "@/lib/supplier-import-job/catalogos-api-auth";
import { loadJobForOrgScope } from "@/lib/supplier-import-job/route-guards";
import { logSupplierImportSensitiveAction } from "@/lib/supplier-import-job/audit-log";

export const maxDuration = 120;

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

    const body = await req.json().catch(() => ({}));
    const result = await approveSupplierImportJobActions(id, {
      normalized_ids: Array.isArray(body.normalized_ids) ? body.normalized_ids : undefined,
      auto_high_confidence:
        body.auto_high_confidence != null && typeof body.auto_high_confidence === "object"
          ? {
              min_confidence:
                typeof body.auto_high_confidence.min_confidence === "number"
                  ? body.auto_high_confidence.min_confidence
                  : undefined,
              max_rows:
                typeof body.auto_high_confidence.max_rows === "number"
                  ? body.auto_high_confidence.max_rows
                  : undefined,
            }
          : undefined,
      confirm_batch: body.confirm_batch === true,
    });

    await logSupplierImportSensitiveAction({
      action: "approve",
      jobId: id,
      batchId: scoped.job.batch_id,
      organizationId: auth.organizationId,
      operatorId: auth.operatorId,
      detail: {
        updated_row_count: result.updated_row_count,
        confirm_batch: body.confirm_batch === true,
      },
    });

    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Approve failed";
    const status =
      msg.includes("must be") || msg.includes("Provide ") || msg.includes("not found")
        ? 400
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
