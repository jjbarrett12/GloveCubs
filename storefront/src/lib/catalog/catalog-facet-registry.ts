/**
 * Facet key registry — mirror of `catalogos/src/lib/product-types/registry.ts`
 * (subset required for URL parsing + filter intersection). Keep in sync with CatalogOS.
 */

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
  "packaging",
  "sterility",
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
  return Array.from(set);
}

export function getAllCatalogFacetKeys(): string[] {
  const out = new Set<string>();
  for (const k of getAllFilterableFacetKeys()) out.add(k);
  for (const k of CATALOG_VARIANT_FACET_KEYS) out.add(k);
  return Array.from(out);
}
