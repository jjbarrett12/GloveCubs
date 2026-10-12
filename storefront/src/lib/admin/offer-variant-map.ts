/**
 * Explicit catalogos.supplier_offers.catalog_variant_id mapping.
 * Pricing identity is this FK — never variant_sku = supplier_sku, manufacturer JSON at request time, or AI.
 *
 * Live commerce remains on catalogos.supplier_offers. catalog_v2.supplier_products /
 * catalog_supplier_product_map / catalog_v2.supplier_offers are unused and are not a second price source.
 */

export const OFFER_VARIANT_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SIZE_LIKE_TOKEN = /^(XXS|XS|S|M|L|XL|XXL|[2-9]XL|[2-9]X)$/i;

export function manufacturerSkuFromVariantMeta(
  metadata: Record<string, unknown> | null | undefined,
  mpn?: string | null
): string | null {
  if (metadata && typeof metadata === "object") {
    const raw = metadata.manufacturer_sku;
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  const m = typeof mpn === "string" ? mpn.trim() : "";
  return m || null;
}

export function canMapOfferToVariant(args: {
  offerProductId: string;
  variantCatalogProductId: string;
  catalogVariantId: string;
}): { ok: true } | { ok: false; reason: string } {
  if (!OFFER_VARIANT_UUID_RE.test(args.catalogVariantId)) {
    return { ok: false, reason: "invalid_variant_id" };
  }
  if (!OFFER_VARIANT_UUID_RE.test(args.offerProductId) || !OFFER_VARIANT_UUID_RE.test(args.variantCatalogProductId)) {
    return { ok: false, reason: "invalid_product_id" };
  }
  if (args.offerProductId !== args.variantCatalogProductId) {
    return { ok: false, reason: "variant_not_on_offer_product" };
  }
  return { ok: true };
}

export type ManualVariantOfferPlan =
  | {
      kind: "upsert";
      catalogVariantId: string;
      variantSku: string;
      supplierSku: string;
    }
  | { kind: "skip"; variantSku: string; reason: "supplier_sku_missing" | "variant_id_missing" };

export function planManualVariantOffers(args: {
  inputVariants: Array<{ variantSku: string; manufacturerSku?: string | null }>;
  dbVariants: Array<{ id: string; variant_sku: string }>;
}): ManualVariantOfferPlan[] {
  const bySku = new Map(args.dbVariants.map((v) => [v.variant_sku.trim(), v.id]));
  return args.inputVariants.map((input) => {
    const variantSku = input.variantSku.trim();
    const supplierSku = input.manufacturerSku?.trim() || null;
    const catalogVariantId = bySku.get(variantSku) ?? null;
    if (!supplierSku) {
      return { kind: "skip", variantSku, reason: "supplier_sku_missing" };
    }
    if (!catalogVariantId) {
      return { kind: "skip", variantSku, reason: "variant_id_missing" };
    }
    return { kind: "upsert", catalogVariantId, variantSku, supplierSku };
  });
}

export type ApparentOfferCandidate = {
  variantId: string;
  variantSku: string;
  sizeCode: string | null;
  manufacturerSku: string | null;
  offerId: string;
  supplierSku: string;
  supplierId: string;
  sellPrice: number | null;
  sizeConflict: boolean;
};

function trailingSkuToken(sku: string): string {
  const parts = sku.trim().split(/[-_/\s]+/);
  return (parts[parts.length - 1] ?? "").toUpperCase();
}

export function offerSizeConflictsWithVariant(sizeCode: string | null, supplierSku: string): boolean {
  const size = sizeCode?.trim().toUpperCase() ?? "";
  if (!size) return false;
  const token = trailingSkuToken(supplierSku);
  if (!SIZE_LIKE_TOKEN.test(token)) return false;
  return token !== size;
}

/** Report-only exact manufacturer SKU ↔ supplier SKU evidence. Never used for pricing or auto-map. */
export function detectApparentOfferCandidates(args: {
  variants: Array<{
    id: string;
    variantSku: string;
    sizeCode: string | null;
    manufacturerSku: string | null;
  }>;
  offers: Array<{
    id: string;
    supplierSku: string;
    supplierId: string;
    sellPrice: number | null;
    catalogVariantId: string | null;
  }>;
}): ApparentOfferCandidate[] {
  const out: ApparentOfferCandidate[] = [];
  for (const v of args.variants) {
    const mfr = v.manufacturerSku?.trim() ?? "";
    if (!mfr) continue;
    for (const o of args.offers) {
      if (o.catalogVariantId) continue;
      if (o.supplierSku.trim() !== mfr) continue;
      out.push({
        variantId: v.id,
        variantSku: v.variantSku,
        sizeCode: v.sizeCode,
        manufacturerSku: v.manufacturerSku,
        offerId: o.id,
        supplierSku: o.supplierSku,
        supplierId: o.supplierId,
        sellPrice: o.sellPrice,
        sizeConflict: offerSizeConflictsWithVariant(v.sizeCode, o.supplierSku),
      });
    }
  }
  return out;
}

/** Test/contract mirror of catalogos.variant_best_offer_price (FK + sell_price only). */
export function selectVariantBestSellPrice(args: {
  variantId: string;
  variantActive: boolean;
  offers: Array<{
    catalogVariantId: string | null;
    isActive: boolean;
    sellPrice: number | null;
    cost?: number | null;
  }>;
}): number | null {
  if (!args.variantActive) return null;
  const prices = args.offers
    .filter(
      (o) =>
        o.catalogVariantId === args.variantId &&
        o.isActive &&
        o.sellPrice != null &&
        Number.isFinite(o.sellPrice) &&
        o.sellPrice > 0
    )
    .map((o) => o.sellPrice as number);
  if (prices.length === 0) return null;
  return Math.min(...prices);
}
