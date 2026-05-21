import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { probeCatalogosHealth } from "@/lib/admin/catalogos-internal-client";
import { computeProductsImportConnectionStatus } from "@/lib/admin/products-import-connection";

/**
 * GET /admin/api/products/import/status
 * Admin-gated env readiness + optional CatalogOS /api/health probe.
 */
export async function GET(request: Request) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const s = computeProductsImportConnectionStatus();
  const probeRequested = new URL(request.url).searchParams.get("probe") === "1";

  let catalogos_reachable: boolean | null = null;
  let catalogos_probe_message: string | null = null;
  let catalogos_probe_latency_ms: number | null = null;

  if (probeRequested && s.catalogos_url_configured) {
    const probe = await probeCatalogosHealth();
    catalogos_reachable = probe.ok;
    catalogos_probe_message = probe.message;
    catalogos_probe_latency_ms = probe.latencyMs ?? null;
  }

  return NextResponse.json({
    configured: s.configured,
    catalogos_url_configured: s.catalogos_url_configured,
    catalogos_base_url: s.catalogos_base_url,
    using_dev_default_url: s.using_dev_default_url,
    internal_key_configured: s.internal_key_configured,
    production_key_safe: s.production_key_safe,
    status: s.status,
    message: s.message,
    catalogos_reachable,
    catalogos_probe_message,
    catalogos_probe_latency_ms,
  });
}
