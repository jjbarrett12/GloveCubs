import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { ADMIN_PRODUCT_UUID_RE } from "@/lib/admin/product-operations";
import {
  manufacturerSkuFromVariantMeta,
  type ApparentOfferCandidate,
  detectApparentOfferCandidates,
} from "@/lib/admin/offer-variant-map";

export type OfferVariantMapOffer = {
  id: string;
  supplierId: string;
  supplierName: string | null;
  supplierSku: string;
  sellPrice: number | null;
  isActive: boolean;
  catalogVariantId: string | null;
};

export type OfferVariantMapVariant = {
  id: string;
  variantSku: string;
  sizeCode: string | null;
  manufacturerSku: string | null;
  isActive: boolean;
};

export type OfferVariantMapPayload =
  | {
      available: true;
      productId: string;
      productName: string;
      variants: OfferVariantMapVariant[];
      offers: OfferVariantMapOffer[];
      apparentCandidates: ApparentOfferCandidate[];
    }
  | { available: false; reason: "not_configured" | "migration_pending" | "not_found" };

function isMissingCatalogVariantColumn(message: string | undefined): boolean {
  const m = (message ?? "").toLowerCase();
  return m.includes("catalog_variant_id") && (m.includes("does not exist") || m.includes("schema cache"));
}

export async function fetchProductOfferVariantMap(productId: string): Promise<OfferVariantMapPayload> {
  if (!ADMIN_PRODUCT_UUID_RE.test(productId)) {
    return { available: false, reason: "not_found" };
  }
  if (!isSupabaseConfigured()) {
    return { available: false, reason: "not_configured" };
  }

  const supabase = getSupabaseAdmin() as any;
  const { data: product, error: pErr } = await supabase
    .schema("catalog_v2")
    .from("catalog_products")
    .select("id, name")
    .eq("id", productId)
    .maybeSingle();
  if (pErr || !product) {
    return { available: false, reason: "not_found" };
  }

  const { data: variantRows, error: vErr } = await supabase
    .schema("catalog_v2")
    .from("catalog_variants")
    .select("id, variant_sku, size_code, metadata, mpn, is_active")
    .eq("catalog_product_id", productId)
    .order("sort_order", { ascending: true });
  if (vErr) {
    return { available: false, reason: "not_found" };
  }

  const { data: offerRows, error: oErr } = await supabase
    .schema("catalogos")
    .from("supplier_offers")
    .select("id, supplier_id, supplier_sku, sell_price, is_active, catalog_variant_id")
    .eq("product_id", productId);

  if (oErr) {
    if (isMissingCatalogVariantColumn(oErr.message)) {
      return { available: false, reason: "migration_pending" };
    }
    return { available: false, reason: "not_found" };
  }

  const supplierIds = [
    ...new Set(
      ((offerRows ?? []) as Array<{ supplier_id: string }>).map((o) => o.supplier_id).filter(Boolean)
    ),
  ];
  let supplierNames = new Map<string, string | null>();
  if (supplierIds.length > 0) {
    const { data: suppliers } = await supabase
      .schema("catalogos")
      .from("suppliers")
      .select("id, name")
      .in("id", supplierIds);
    supplierNames = new Map(
      ((suppliers ?? []) as Array<{ id: string; name: string | null }>).map((s) => [s.id, s.name ?? null])
    );
  }

  const variants: OfferVariantMapVariant[] = (
    (variantRows ?? []) as Array<{
      id: string;
      variant_sku: string;
      size_code: string | null;
      metadata: Record<string, unknown> | null;
      mpn: string | null;
      is_active: boolean;
    }>
  ).map((v) => ({
    id: v.id,
    variantSku: v.variant_sku,
    sizeCode: v.size_code,
    manufacturerSku: manufacturerSkuFromVariantMeta(v.metadata, v.mpn),
    isActive: v.is_active,
  }));

  const offers: OfferVariantMapOffer[] = (
    (offerRows ?? []) as Array<{
      id: string;
      supplier_id: string;
      supplier_sku: string;
      sell_price: number | null;
      is_active: boolean;
      catalog_variant_id: string | null;
    }>
  ).map((o) => ({
    id: o.id,
    supplierId: o.supplier_id,
    supplierName: supplierNames.get(o.supplier_id) ?? null,
    supplierSku: o.supplier_sku,
    sellPrice: o.sell_price != null && Number.isFinite(Number(o.sell_price)) ? Number(o.sell_price) : null,
    isActive: o.is_active === true,
    catalogVariantId: o.catalog_variant_id,
  }));

  return {
    available: true,
    productId: (product as { id: string }).id,
    productName: (product as { name: string }).name,
    variants,
    offers,
    apparentCandidates: detectApparentOfferCandidates({
      variants,
      offers: offers.map((o) => ({
        id: o.id,
        supplierSku: o.supplierSku,
        supplierId: o.supplierId,
        sellPrice: o.sellPrice,
        catalogVariantId: o.catalogVariantId,
      })),
    }),
  };
}
