import type { QuoteCartItem } from "@/lib/quote-cart/types";

const MAX_LINE_NOTE_LEN = 2000;

function normalizeLineNote(raw: string | null | undefined): string | null {
  const t = typeof raw === "string" ? raw.trim().slice(0, MAX_LINE_NOTE_LEN) : "";
  return t.length ? t : null;
}

/** Normalize optional variant fields; strip orphan SKU/size when no variant id. */
export function normalizeQuoteCartLineInput(
  p: Omit<QuoteCartItem, "quantity">
): Omit<QuoteCartItem, "quantity"> {
  const vid = p.catalog_variant_id?.trim() || null;
  const line_note = normalizeLineNote(p.line_note ?? null);
  if (!vid) {
    return {
      product_id: p.product_id,
      name: p.name,
      slug: p.slug,
      brandName: p.brandName,
      line_note,
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
    line_note,
    catalog_variant_id: vid,
    variant_sku: p.variant_sku?.trim() || null,
    size_code: p.size_code?.trim() || null,
  };
}

/** Same catalog row (product + variant) — used when merging PDP “add to quote” into an existing cart line. */
export function quoteCartCatalogMergeMatch(
  line: Pick<QuoteCartItem, "product_id" | "catalog_variant_id">,
  incoming: Pick<QuoteCartItem, "product_id" | "catalog_variant_id">
): boolean {
  if (line.product_id !== incoming.product_id) return false;
  const a = line.catalog_variant_id?.trim() || null;
  const b = incoming.catalog_variant_id?.trim() || null;
  return a === b;
}

/** Full line identity including per-line note (for tests and rare multi-line cases). */
export function quoteCartLinesMatch(
  line: Pick<QuoteCartItem, "product_id" | "catalog_variant_id" | "line_note">,
  incoming: Pick<QuoteCartItem, "product_id" | "catalog_variant_id" | "line_note">
): boolean {
  if (line.product_id !== incoming.product_id) return false;
  const a = line.catalog_variant_id?.trim() || null;
  const b = incoming.catalog_variant_id?.trim() || null;
  if (a !== b) return false;
  const na = normalizeLineNote(line.line_note ?? null);
  const nb = normalizeLineNote(incoming.line_note ?? null);
  return na === nb;
}

export function quoteCartLineReactKey(item: QuoteCartItem, index: number): string {
  const v = item.catalog_variant_id?.trim();
  return v ? `${item.product_id}:${v}` : `${item.product_id}:base:${index}`;
}
