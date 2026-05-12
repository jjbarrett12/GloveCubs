import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { catalogosInternalRequest } from "@/lib/admin/catalogos-internal-client";
import { toCatalogosErrorResponse } from "@/lib/admin/products-import-proxy";

const MAX_LIMIT = 100;

/**
 * GET /admin/api/products/import/url/jobs
 * Admin-gated proxy → CatalogOS GET /api/admin/url-import.
 */
export async function GET(request: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const rawLimit = Number(url.searchParams.get("limit"));
  const limit =
    Number.isFinite(rawLimit) && rawLimit >= 1 ? Math.min(Math.floor(rawLimit), MAX_LIMIT) : 50;

  const result = await catalogosInternalRequest({
    method: "GET",
    path: `/api/admin/url-import?limit=${limit}`,
  });
  if (!result.ok) return toCatalogosErrorResponse(result);
  return NextResponse.json(result.data, { status: 200 });
}
