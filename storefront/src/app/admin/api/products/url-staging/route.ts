import { NextRequest, NextResponse } from "next/server";
import { resolveAdminAccess } from "@/lib/admin/get-admin-user";
import { listClipboardStaging, createClipboardStaging } from "@/lib/admin/clipboard-url-staging";
import { probeCatalogosHealth } from "@/lib/admin/catalogos-internal-client";
import { computeProductsImportConnectionStatus } from "@/lib/admin/products-import-connection";

export const dynamic = "force-dynamic";

function adminGateResponse(access: Awaited<ReturnType<typeof resolveAdminAccess>>) {
  if (access.kind === "sign_in_required") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (access.kind === "not_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const access = await resolveAdminAccess();
  const denied = adminGateResponse(access);
  if (denied) return denied;
  const { rows } = await listClipboardStaging(100);
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const access = await resolveAdminAccess();
  const denied = adminGateResponse(access);
  if (denied) return denied;
  if (access.kind !== "ok") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const admin = { id: access.userId };

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json_body" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const productPageUrl = typeof b.product_page_url === "string" ? b.product_page_url : "";
  const imageUrl = typeof b.image_url === "string" ? b.image_url : null;

  const res = await createClipboardStaging({
    productPageUrl,
    imageUrl: imageUrl?.trim() ? imageUrl : null,
    createdBy: admin.id,
  });
  if ("error" in res) {
    const status = res.error.includes("could not be written") ? 503 : 400;
    return NextResponse.json({ error: res.error }, { status });
  }

  const conn = computeProductsImportConnectionStatus();
  let catalogosEnrichment: "available" | "unavailable" | "not_configured" = "not_configured";
  if (conn.status === "online") {
    const probe = await probeCatalogosHealth();
    catalogosEnrichment = probe.ok ? "available" : "unavailable";
  }

  return NextResponse.json(
    {
      ...res,
      staged: true,
      catalogos_enrichment: catalogosEnrichment,
    },
    { status: 201 }
  );
}
