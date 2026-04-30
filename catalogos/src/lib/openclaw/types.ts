/**
 * OpenClaw — Glove catalog extraction workflow types.
 * Output is designed for CatalogOS staging ingestion (review, not auto-publish).
 */

// --- Step 1: Discovery ---
export interface DiscoveredProductUrl {
  source_root_url: string;
  discovered_product_url: string;
  discovery_confidence: number;
  category_path: string;
  notes: string;
}

export interface ProductUrlList {
  source_root_url: string;
  discovered: DiscoveredProductUrl[];
  discovered_at: string;
}

// --- Step 2: Raw page data ---
export interface FetchedProductPage {
  url: string;
  final_url?: string;
  html: string;
  content_type?: string;
  fetch_time_ms?: number;
  error?: string;
}

export interface ParsedProductPage {
  url: string;
  page_title?: string;
  product_title?: string;
  brand?: string;
  supplier_manufacturer?: string;
  description?: string;
  bullet_points?: string[];
  spec_table?: Record<string, string>;
  sku?: string;
  mpn?: string;
  upc?: string;
  images?: string[];
  /** Absolute URLs to spec sheets, SDS, or technical PDFs (crawl-time only; not parsed as content). */
  spec_sheet_urls?: string[];
  breadcrumbs?: string[];
  variant_options?: VariantOption[];
  json_ld?: Record<string, unknown>[];
  raw_html_snippet?: string;
}

export interface VariantOption {
  dimension: "size" | "color" | "thickness" | "packaging" | "other";
  values: string[];
  variant_sku_map?: Record<string, string>;
}

// --- Step 3: Extracted attributes (per field) ---
export type ExtractionMethod =
  | "exact_text"
  | "table_parse"
  | "variant_json"
  | "pattern_match"
  | "inference"
  | "ai_semantic";

export interface ExtractedField {
  raw_value: unknown;
  normalized_value: unknown;
  confidence: number;
  extraction_method: ExtractionMethod;
}

export interface ExtractedProductFamily {
  source_url: string;
  source_category_path?: string;
  family_name?: string;
  variant_name?: string;
  brand?: ExtractedField;
  supplier_name?: ExtractedField;
  sku?: ExtractedField;
  mpn?: ExtractedField;
  material?: ExtractedField;
  glove_type?: ExtractedField;
  size?: ExtractedField;
  color?: ExtractedField;
  thickness_mil?: ExtractedField;
  powder_status?: ExtractedField;
  sterile_status?: ExtractedField;
  box_qty?: ExtractedField;
  case_qty?: ExtractedField;
  category?: ExtractedField;
  length_in?: ExtractedField;
  texture?: ExtractedField;
  cuff_style?: ExtractedField;
  grade?: ExtractedField;
  use_case_tags?: ExtractedField;
  compliance_tags?: ExtractedField;
  description_clean?: ExtractedField;
  image_url?: ExtractedField;
  [key: string]: unknown;
}

// --- Step 5: Grouping ---
export interface VariantRow {
  family_group_key: string;
  variant_group_key: string;
  variation_dimensions: string[];
  extracted: ExtractedProductFamily;
  variant_index: number;
}

// --- Step 6: Warnings ---
export type WarningCode =
  | "missing_material"
  | "missing_size"
  | "missing_pack_quantity"
  | "missing_case_quantity"
  | "thickness_ambiguous"
  | "duplicate_risk"
  | "likely_same_family"
  | "product_page_unclear"
  | "price_hidden"
  | "supplier_ambiguous"
  | "conflicting_powder_sterile"
  | "missing_required_attributes"
  | "invalid_ontology_value";

export interface RowWarnings {
  needs_review: boolean;
  warning_codes: WarningCode[];
  warning_messages: string[];
  overall_confidence: number;
}

/** Per-field extraction for mapped site-filter fields (raw_value, normalized_value, confidence). */
export interface FieldExtraction {
  raw_value: unknown;
  normalized_value: unknown;
  confidence: number;
}

/** Final output row: one per purchasable variant. Only site-filter fields normalized; rest in extraction_notes / raw_specs_json / warning_messages. */
export interface GloveCatalogRow {
  source_url: string;
  family_name: string;
  variant_name: string;
  sku: string;
  brand: string;
  material: string;
  glove_type: string;
  size: string;
  color: string;
  thickness_mil: string;
  powder_status: string;
  sterile_status: string;
  box_qty: string;
  case_qty: string;
  texture: string;
  cuff_style: string;
  category: string;
  overall_confidence: number;
  needs_review: boolean;
  warning_messages: string;
  raw_title: string;
  raw_description: string;
  raw_specs_json: string;
  extraction_notes: string;
  /** Per mapped field: raw_value, normalized_value, confidence. Keys match site filter fields. */
  field_extraction?: Record<string, FieldExtraction>;
  family_group_key?: string;
  variant_group_key?: string;
}

// --- Step 8: Export summary ---
export interface ExtractionSummary {
  root_url: string;
  total_product_urls_discovered: number;
  total_product_pages_parsed: number;
  total_variant_rows_created: number;
  total_high_confidence_rows: number;
  total_needs_review_rows: number;
  top_warning_categories: { code: string; count: number }[];
  duplicate_risk_observations: string[];
  normalization_issues_found: string[];
  generated_at: string;
}
