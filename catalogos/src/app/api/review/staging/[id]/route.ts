import { NextResponse } from "next/server";
import { getStagingById } from "@/lib/review/data";
import { getResolutionCandidatesForNormalizedRow } from "@/lib/product-resolution/resolution-data";
import { evaluatePublishReadiness } from "@/lib/review/publish-guards";
import { listAdminCatalogAuditForNormalized } from "@/lib/review/admin-audit";
import { getSupabaseCatalogos } from "@/lib/db/client";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const row = await getStagingById(id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const resolution_candidates = await getResolutionCandidatesForNormalizedRow(id);
  const publish_readiness = await evaluatePublishReadiness(id);
  const admin_audit = await listAdminCatalogAuditForNormalized(id, 35);

  let supplier_offers: unknown[] = [];
  const masterId = row.master_product_id as string | null | undefined;
  const supplierId = row.supplier_id as string | null | undefined;
  if (masterId && supplierId) {
    const supabase = getSupabaseCatalogos(true);
    const { data } = await supabase
      .from("supplier_offers")
      .select("id, supplier_id, product_id, supplier_sku, cost, sell_price, lead_time_days, is_active, normalized_id")
      .eq("product_id", masterId)
      .eq("supplier_id", supplierId)
      .order("updated_at", { ascending: false });
    supplier_offers = data ?? [];
  }

  return NextResponse.json({
    ...row,
    resolution_candidates,
    publish_readiness,
    admin_audit,
    supplier_offers,
  });
}
