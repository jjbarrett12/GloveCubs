import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { catalogosInternalRequest } from "@/lib/admin/catalogos-internal-client";
import { toCatalogosErrorResponse } from "@/lib/admin/products-import-proxy";

const JOB_ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

/**
 * GET /admin/api/products/import/url/jobs/[jobId]
 * Admin-gated proxy → CatalogOS GET /api/admin/url-import/[jobId].
 */
export async function GET(_request: NextRequest, ctx: { params: { jobId: string } }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobId = ctx.params.jobId?.trim();
  if (!jobId || !JOB_ID_RE.test(jobId)) {
    return NextResponse.json({ error: "invalid_job_id" }, { status: 400 });
  }

  const result = await catalogosInternalRequest({
    method: "GET",
    path: `/api/admin/url-import/${encodeURIComponent(jobId)}`,
  });
  if (!result.ok) return toCatalogosErrorResponse(result);
  return NextResponse.json(result.data, { status: 200 });
}
