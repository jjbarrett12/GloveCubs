/**
 * GET /api/supplier-import/jobs/{id}
 */

import { NextResponse } from "next/server";
import { toPublicJob } from "@/lib/supplier-import-job/service";
import { requireSupplierImportAuth } from "@/lib/supplier-import-job/catalogos-api-auth";
import { loadJobForOrgScope } from "@/lib/supplier-import-job/route-guards";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireSupplierImportAuth(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing job id" }, { status: 400 });
    }
    const scoped = await loadJobForOrgScope(id, auth.organizationId);
    if (scoped instanceof NextResponse) return scoped;
    return NextResponse.json({ job: toPublicJob(scoped.job) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Get job failed" },
      { status: 500 }
    );
  }
}
