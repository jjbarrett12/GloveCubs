import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { computeProductsImportConnectionStatus } from "@/lib/admin/products-import-connection";

/**
 * GET /admin/api/products/import/status
 * Admin-gated, env-only readiness (no CatalogOS network probe in Phase 0/1).
 */
export async function GET() {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const s = computeProductsImportConnectionStatus();
  return NextResponse.json({
    configured: s.configured,
    catalogos_url_configured: s.catalogos_url_configured,
    internal_key_configured: s.internal_key_configured,
    production_key_safe: s.production_key_safe,
    status: s.status,
    message: s.message,
  });
}
