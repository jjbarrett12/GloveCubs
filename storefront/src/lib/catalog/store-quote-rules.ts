import type { StoreProductRow } from "@/lib/catalog/store-products";
import { isVariantPurchasableAtZeroLocalStock, fulfillmentConfigFromRow } from "@/lib/fulfillment/variant-fulfillment-config";

/** Mirrors `quote-request` route — client may only see NEXT_PUBLIC_* at build time. */
export function isVariantMandatoryEnforceEnabled(): boolean {
  const v =
    process.env.VARIANT_MANDATORY_ENFORCE ?? process.env.NEXT_PUBLIC_VARIANT_MANDATORY_ENFORCE;
  if (v === "0" || v === "off" || String(v || "").toLowerCase() === "false" || String(v || "").toLowerCase() === "no") {
    return false;
  }
  return v === "1" || v === "true" || ["yes", "on"].includes(String(v || "").toLowerCase());
}

export function isQuoteVariantIdentityComplete(
  product: Pick<StoreProductRow, "catalogVariantId" | "variantSku">
): boolean {
  const vid = product.catalogVariantId?.trim();
  const sku = product.variantSku?.trim();
  return Boolean(vid && sku);
}

/** PLP: more than one active sellable variant — must choose on PDP before quoting. */
export function productRequiresSizeSelection(product: Pick<StoreProductRow, "activeVariantCount">): boolean {
  return (product.activeVariantCount ?? 0) > 1;
}

/** Whether Add to Quote is allowed for this row (single-variant or explicit variant on PDP). */
export function canAddProductRowToQuote(product: StoreProductRow): boolean {
  if (productRequiresSizeSelection(product)) return false;
  if ((product.activeVariantCount ?? 0) === 0) return false;
  if (!isQuoteVariantIdentityComplete(product)) {
    return !isVariantMandatoryEnforceEnabled();
  }
  if (!isStorefrontStockEligible(product)) return false;
  return true;
}

/** Dropship variants remain quotable at zero local inventory; stocked requires available cases unless enforcement off. */
export function isStorefrontStockEligible(
  product: Pick<StoreProductRow, "fulfillmentMode" | "localAvailableStock" | "stockEnforcement">,
): boolean {
  const cfg = fulfillmentConfigFromRow({
    fulfillment_mode: product.fulfillmentMode ?? "dropship",
    stock_enforcement: product.stockEnforcement === true,
  });
  if (isVariantPurchasableAtZeroLocalStock(cfg)) return true;
  const available = Math.max(0, Number(product.localAvailableStock ?? 0) || 0);
  return available > 0;
}

/** Lines safe for bulk “add page to quote” — never multi-variant parents. */
export function isStoreProductRowQuotableOnListing(product: StoreProductRow): boolean {
  return canAddProductRowToQuote(product) && isQuoteVariantIdentityComplete(product);
}

export function storeProductPdpVariantsAnchor(slug: string): string {
  return `/store/p/${encodeURIComponent(slug)}#variants`;
}
