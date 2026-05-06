/**
 * Storefront catalog filter types — aligned with CatalogOS `catalogos/src/lib/catalog/types.ts`
 * (duplicated here so storefront does not depend on the catalogos app package).
 */

export interface StorefrontFilterParams {
  category?: string;
  material?: string[];
  size?: string[];
  color?: string[];
  brand?: string[];
  thickness_mil?: string[];
  powder?: string[];
  grade?: string[];
  industries?: string[];
  certifications?: string[];
  uses?: string[];
  protection_tags?: string[];
  /** @deprecated Merged into certifications when parsing URLs. */
  compliance_certifications?: string[];
  texture?: string[];
  cuff_style?: string[];
  hand_orientation?: string[];
  packaging?: string[];
  sterility?: string[];
  cut_level_ansi?: string[];
  puncture_level?: string[];
  abrasion_level?: string[];
  flame_resistant?: string[];
  arc_rating?: string[];
  warm_cold_weather?: string[];
  price_min?: number;
  price_max?: number;
  q?: string;
  sort?: "relevance" | "price_asc" | "price_desc" | "newest" | "price_per_glove_asc" | "name_asc" | "name_desc";
  page?: number;
  limit?: number;
}

/** /store URL state — same shape as CatalogOS `StorefrontFilterParams` (including name sorts). */
export type StoreCatalogUrlState = StorefrontFilterParams;

export type StoreFacetCounts = Record<string, { value: string; count: number; label?: string }[]>;
