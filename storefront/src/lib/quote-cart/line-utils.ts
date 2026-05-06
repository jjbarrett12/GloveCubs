import type { QuoteCartItem } from "@/lib/quote-cart/types";

/** Normalize optional variant fields; strip orphan SKU/size when no variant id. */
export function normalizeQuoteCartLineInput(
  p: Omit<QuoteCartItem, "quantity">
): Omit<QuoteCartItem, "quantity"> {
  const vid = p.catalog_variant_id?.trim() || null;
  if (!vid) {
    return {
      product_id: p.product_id,
      name: p.name,
      slug: p.slug,
      brandName: p.brandName,
      catalog_variant_id: null,
      variant_sku: null,
      size_code: null,
    };
  }
  return {
    product_id: p.product_id,
    name: p.name,
    slug: p.slug,
    brandName: p.brandName,
    catalog_variant_id: vid,
    variant_sku: p.variant_sku?.trim() || null,
    size_code: p.size_code?.trim() || null,
  };
}

export function quoteCartLinesMatch(
  line: Pick<QuoteCartItem, "product_id" | "catalog_variant_id">,
  incoming: Pick<QuoteCartItem, "product_id" | "catalog_variant_id">
): boolean {
  if (line.product_id !== incoming.product_id) return false;
  const a = line.catalog_variant_id?.trim() || null;
  const b = incoming.catalog_variant_id?.trim() || null;
  return a === b;
}

export function quoteCartLineReactKey(item: QuoteCartItem, index: number): string {
  const v = item.catalog_variant_id?.trim();
  return v ? `${item.product_id}:${v}` : `${item.product_id}:base:${index}`;
}
