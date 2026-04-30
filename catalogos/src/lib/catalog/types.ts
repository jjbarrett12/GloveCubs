/**
 * Storefront catalog types: filters, product list, facets, pagination.
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
  /** @deprecated Use `certifications`; merged automatically when parsing URLs. */
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
  sort?: "relevance" | "price_asc" | "price_desc" | "newest" | "price_per_glove_asc";
  page?: number;
  limit?: number;
  /** Industry quick-select key; maps to industries filter. */
  industry_quick?: string;
}

export interface LiveProductItem {
  id: string;
  sku: string;
  slug: string | null;
  name: string;
  description: string | null;
  category_id: string;
  category_slug?: string;
  brand_id: string | null;
  brand_name?: string | null;
  attributes: Record<string, unknown>;
  best_price?: number | null;
  supplier_count?: number;
  published_at: string | null;
}

/** Product detail: LiveProductItem + images for PDP. */
export interface ProductDetail extends LiveProductItem {
  images: string[];
}

export interface ProductListPayload {
  items: LiveProductItem[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  facets?: FacetCounts;
  price_bounds?: { min: number; max: number };
}

export interface FacetCounts {
  [attributeKey: string]: { value: string; count: number; label?: string }[];
}

/** From dictionary: drives facet ordering and grouping in storefront UI. */
export interface FacetDefinitionSummary {
  attribute_key: string;
  label: string;
  display_group: string | null;
  sort_order: number;
  cardinality: "single" | "multi";
}

/** Contract for filter sidebar: available facets with counts + selected filters + product list. */
export interface StorefrontFilterUIContract {
  products: ProductListPayload;
  selected_filters: StorefrontFilterParams;
  available_facets: FacetCounts;
  price_bounds: { min: number; max: number };
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface ProductOfferRow {
  supplier_id: string;
  supplier_sku: string;
  cost: number;
  sell_price?: number | null;
  lead_time_days: number | null;
}

export interface ProductOffersSummary {
  product_id: string;
  offers: ProductOfferRow[];
  best_price: number;
  offer_count: number;
}
