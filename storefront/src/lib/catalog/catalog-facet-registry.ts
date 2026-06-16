/**
 * Facet key registry — mirror of `catalogos/src/lib/product-types/registry.ts`
 * (subset required for URL parsing + filter intersection). Keep in sync with CatalogOS.
 */

/** Never exposed in storefront customer filter UI (internal / legacy / inventory). */
export const HIDDEN_STOREFRONT_FACET_KEYS = [
  "box_quantity",
  "pack_quantity",
  "packaging",
  "case_quantity",
  "sold_as",
  "in_stock",
  "stock",
  "stock_status",
  "inventory",
  "availability",
] as const;

export type HiddenStorefrontFacetKey = (typeof HIDDEN_STOREFRONT_FACET_KEYS)[number];

export function isCustomerFacingFacetKey(key: string): boolean {
  return !(HIDDEN_STOREFRONT_FACET_KEYS as readonly string[]).includes(key);
}

const DISPOSABLE_FILTER_KEYS = [
  "material",
  "color",
  "brand",
  "thickness_mil",
  "powder",
  "grade",
  "industries",
  "certifications",
  "uses",
  "protection_tags",
  "texture",
  "cuff_style",
  "hand_orientation",
  "sterility",
  "units_per_case",
  "cases_per_pallet",
  "pallet_pricing_available",
] as const;

const WORK_FILTER_KEYS = [
  "material",
  "color",
  "brand",
  "cut_level_ansi",
  "puncture_level",
  "abrasion_level",
  "flame_resistant",
  "arc_rating",
  "warm_cold_weather",
  "coating",
  "liner",
  "gauge",
  "certifications",
  "uses",
  "industries",
  "texture",
  "cuff_style",
  "units_per_case",
  "cases_per_pallet",
  "pallet_pricing_available",
] as const;

export const GLOBAL_MULTI_SELECT_ATTRIBUTE_KEYS = [
  "industries",
  "certifications",
  "uses",
  "protection_tags",
] as const;

const CATALOG_VARIANT_FACET_KEYS = ["size"] as const;

export function getAllFilterableFacetKeys(): string[] {
  const set = new Set<string>();
  for (const k of DISPOSABLE_FILTER_KEYS) set.add(k);
  for (const k of WORK_FILTER_KEYS) set.add(k);
  return Array.from(set).filter(isCustomerFacingFacetKey);
}

export function getAllCatalogFacetKeys(): string[] {
  const out = new Set<string>();
  for (const k of getAllFilterableFacetKeys()) out.add(k);
  for (const k of CATALOG_VARIANT_FACET_KEYS) out.add(k);
  return Array.from(out);
}

/** Customer-facing facet keys for sidebar (excludes hidden + brand handled separately). */
export function getCustomerFacingCatalogFacetKeys(): string[] {
  return getAllCatalogFacetKeys().filter(isCustomerFacingFacetKey);
}
