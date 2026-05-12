import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { catalogosInternalRequest } from "@/lib/admin/catalogos-internal-client";
import { parseJsonBody, toCatalogosErrorResponse } from "@/lib/admin/products-import-proxy";

const JOB_ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
const MAX_PRODUCT_IDS = 2000;

/**
 * POST /admin/api/products/import/url/jobs/[jobId]/bridge
 * Admin-gated proxy → CatalogOS POST /api/admin/url-import/[jobId]/bridge.
 *
 * Operators must explicitly select rows. Empty product_ids is rejected so we never bridge "all" by default.
 * Storefront does NOT write canonical product data — CatalogOS owns staging/review/publish.
 */
export async function POST(request: NextRequest, ctx: { params: { jobId: string } }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobId = ctx.params.jobId?.trim();
  if (!jobId || !JOB_ID_RE.test(jobId)) {
    return NextResponse.json({ error: "invalid_job_id" }, { status: 400 });
  }

  const parsed = await parseJsonBody<{ product_ids?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const idsRaw = parsed.value?.product_ids;
  if (!Array.isArray(idsRaw)) {
    return NextResponse.json(
      { error: "product_ids must be an array of selected extracted product ids" },
      { status: 400 }
    );
  }
  const product_ids = Array.from(
    new Set(
      idsRaw
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim())
        .filter(Boolean)
    )
  ).slice(0, MAX_PRODUCT_IDS);

  if (product_ids.length === 0) {
    return NextResponse.json(
      { error: "Select at least one extracted product to send to review queue" },
      { status: 400 }
    );
  }

  const result = await catalogosInternalRequest({
    method: "POST",
    path: `/api/admin/url-import/${encodeURIComponent(jobId)}/bridge`,
    body: { product_ids },
  });

  if (!result.ok) return toCatalogosErrorResponse(result);
  return NextResponse.json(result.data, { status: 200 });
}
