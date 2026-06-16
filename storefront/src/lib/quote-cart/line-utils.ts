import type { QuoteCartItem, QuoteCartSellUnit } from "@/lib/quote-cart/types";

const MAX_LINE_NOTE_LEN = 2000;

export function resolveQuoteSellUnit(raw: unknown): QuoteCartSellUnit {
  return raw === "pallet" ? "pallet" : "case";
}

function normalizeLineNote(raw: string | null | undefined): string | null {
  const t = typeof raw === "string" ? raw.trim().slice(0, MAX_LINE_NOTE_LEN) : "";
  return t.length ? t : null;
}

function normalizeOptionalNumber(raw: unknown): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function normalizeUnitNoun(raw: unknown): QuoteCartItem["unit_noun"] | undefined {
  if (raw === "gloves" || raw === "pairs" || raw === "units") return raw;
  return undefined;
}

/** Normalize optional variant fields; strip orphan SKU/size when no variant id. */
export function normalizeQuoteCartLineInput(
  p: Omit<QuoteCartItem, "quantity">
): Omit<QuoteCartItem, "quantity"> {
  const vid = p.catalog_variant_id?.trim() || null;
  const line_note = normalizeLineNote(p.line_note ?? null);
  const sell_unit = resolveQuoteSellUnit(p.sell_unit);
  const commerceFields = {
    sell_unit,
    unit_price_major: normalizeOptionalNumber(p.unit_price_major),
    units_per_case: normalizeOptionalNumber(p.units_per_case),
    cases_per_pallet: normalizeOptionalNumber(p.cases_per_pallet),
    units_per_pallet: normalizeOptionalNumber(p.units_per_pallet),
    unit_noun: normalizeUnitNoun(p.unit_noun),
    commerce_summary: typeof p.commerce_summary === "string" ? p.commerce_summary.trim() || null : null,
    line_unit_label: typeof p.line_unit_label === "string" ? p.line_unit_label.trim() || sell_unit : sell_unit,
  };
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
      ...commerceFields,
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
    ...commerceFields,
  };
}

/** Same catalog row (product + variant + sell unit) — used when merging PDP add to quote. */
export function quoteCartCatalogMergeMatch(
  line: Pick<QuoteCartItem, "product_id" | "catalog_variant_id" | "sell_unit">,
  incoming: Pick<QuoteCartItem, "product_id" | "catalog_variant_id" | "sell_unit">
): boolean {
  if (line.product_id !== incoming.product_id) return false;
  const a = line.catalog_variant_id?.trim() || null;
  const b = incoming.catalog_variant_id?.trim() || null;
  if (a !== b) return false;
  return resolveQuoteSellUnit(line.sell_unit) === resolveQuoteSellUnit(incoming.sell_unit);
}

/** Full line identity including per-line note (for tests and rare multi-line cases). */
export function quoteCartLinesMatch(
  line: Pick<QuoteCartItem, "product_id" | "catalog_variant_id" | "line_note" | "sell_unit">,
  incoming: Pick<QuoteCartItem, "product_id" | "catalog_variant_id" | "line_note" | "sell_unit">
): boolean {
  if (line.product_id !== incoming.product_id) return false;
  const a = line.catalog_variant_id?.trim() || null;
  const b = incoming.catalog_variant_id?.trim() || null;
  if (a !== b) return false;
  if (resolveQuoteSellUnit(line.sell_unit) !== resolveQuoteSellUnit(incoming.sell_unit)) return false;
  const na = normalizeLineNote(line.line_note ?? null);
  const nb = normalizeLineNote(incoming.line_note ?? null);
  return na === nb;
}

export function quoteCartLineReactKey(item: QuoteCartItem, index: number): string {
  const sellUnit = resolveQuoteSellUnit(item.sell_unit);
  const v = item.catalog_variant_id?.trim();
  return v ? `${item.product_id}:${v}:${sellUnit}` : `${item.product_id}:${sellUnit}:base:${index}`;
}
