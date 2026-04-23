/**
 * TypeScript types for normalized product model (ingestion output).
 * Powers storefront filters and search; all extractable fields + filter attributes.
 */

import type {
  StorefrontCategoryParam,
  MaterialOption,
  SizeOption,
  ColorOption,
  ThicknessMilOption,
  PowderOption,
  GradeOption,
  IndustryOption,
  ComplianceOption,
  TextureOption,
  CuffStyleOption,
  HandOrientationOption,
  PackagingOption,
  SterilityOption,
  CutLevelAnsiOption,
  PunctureLevelOption,
  AbrasionLevelOption,
  ArcRatingOption,
  WarmColdWeatherOption,
} from "./filter-attributes";

/** Universal + category-specific filter attributes (normalized for storefront). */
export interface FilterAttributes {
  price_range?: string;
  category?: StorefrontCategoryParam;
  material?: MaterialOption | string;
  size?: SizeOption | string;
  color?: ColorOption | string;
  brand?: string;
  // Disposable glove
  thickness_mil?: ThicknessMilOption | string;
  powder?: PowderOption | string;
  grade?: GradeOption | string;
  industries?: IndustryOption[] | string[];
  compliance_certifications?: ComplianceOption[] | string[];
  texture?: TextureOption | string;
  cuff_style?: CuffStyleOption | string;
  hand_orientation?: HandOrientationOption | string;
  packaging?: PackagingOption | string;
  sterility?: SterilityOption | string;
  // Work glove
  cut_level_ansi?: CutLevelAnsiOption | string;
  puncture_level?: PunctureLevelOption | string;
  abrasion_level?: AbrasionLevelOption | string;
  flame_resistant?: string;
  arc_rating?: ArcRatingOption | string;
  warm_cold_weather?: WarmColdWeatherOption | string;
}

/** Core product fields extracted by ingestion (not filter facets). */
export interface NormalizedProductCore {
  canonical_title: string;
  short_description?: string;
  long_description?: string;
  product_details?: string;
  specifications?: Record<string, string>;
  bullets?: string[];
  brand?: string;
  manufacturer_part_number?: string;
  supplier_sku: string;
  upc?: string;
  supplier_cost: number;
  images: string[];
  stock_status?: string;
  case_qty?: number;
  box_qty?: number;
  lead_time_days?: number;
}

/** Full normalized product: core + filter attributes. Used for staging and storefront. */
export interface NormalizedProduct extends NormalizedProductCore {
  category_slug: StorefrontCategoryParam | string;
  filter_attributes: FilterAttributes;
}

/** Staging row shape: normalized_data holds NormalizedProduct; attributes is the same as filter_attributes (denormalized for queries). */
export interface NormalizedStagingRow {
  id: string;
  batch_id: string;
  raw_id: string;
  supplier_id: string;
  normalized_data: NormalizedProduct & { anomaly_flags?: ReviewFlag[] };
  attributes: FilterAttributes;
  match_confidence: number | null;
  master_product_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ReviewFlag {
  flag_type: string;
  attribute_key?: string;
  message: string;
  severity: "warning" | "error";
  payload?: Record<string, unknown>;
}
