/**
 * Attribute dictionary — TypeScript types for categories, attribute definitions,
 * allowed values, requirements, and normalized ingestion payloads.
 * Powers ingestion, review validation, storefront faceting, and search.
 *
 * Persisted category slugs are defined by the product type registry.
 */

import type { ProductTypeKey } from "@/lib/product-types";

// -----------------------------------------------------------------------------
// Category (DB + ingestion; no pseudo "all_categories")
// -----------------------------------------------------------------------------
export type CategorySlug = ProductTypeKey;

// -----------------------------------------------------------------------------
// Attribute keys (slugs) by scope
// -----------------------------------------------------------------------------
export const UNIVERSAL_ATTRIBUTE_KEYS = ["category", "material", "size", "color", "brand", "price_range"] as const;
export const DISPOSABLE_ATTRIBUTE_KEYS = [
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
export const WORK_GLOVE_ATTRIBUTE_KEYS = [
  "cut_level_ansi", "puncture_level", "abrasion_level", "flame_resistant", "arc_rating", "warm_cold_weather",
] as const;

export type UniversalAttributeSlug = (typeof UNIVERSAL_ATTRIBUTE_KEYS)[number];
export type DisposableAttributeSlug = (typeof DISPOSABLE_ATTRIBUTE_KEYS)[number];
export type WorkGloveAttributeSlug = (typeof WORK_GLOVE_ATTRIBUTE_KEYS)[number];
export type AttributeSlug = UniversalAttributeSlug | DisposableAttributeSlug | WorkGloveAttributeSlug;

// -----------------------------------------------------------------------------
// Allowed value slugs (exact values from dictionary)
// -----------------------------------------------------------------------------
export const MATERIAL_VALUES = ["nitrile", "latex", "vinyl", "polyethylene_pe"] as const;
export const SIZE_VALUES = ["xs", "s", "m", "l", "xl", "xxl"] as const;
export const COLOR_VALUES = ["blue", "purple", "black", "white", "light_blue", "orange", "violet", "green", "tan", "gray", "beige", "yellow", "brown", "pink"] as const;
/** All thicknesses listed individually (2–20 mil); no 7+ catch-all. */
export const THICKNESS_MIL_VALUES = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20"] as const;
export const POWDER_VALUES = ["powder_free", "powdered"] as const;
export const GRADE_VALUES = ["medical_exam_grade", "industrial_grade", "food_service_grade"] as const;
export const INDUSTRIES_VALUES = ["healthcare", "food_service", "food_processing", "janitorial", "sanitation", "laboratories", "pharmaceuticals", "beauty_personal_care", "tattoo_body_art", "automotive", "education"] as const;
export const COMPLIANCE_VALUES = ["fda_approved", "astm_tested", "food_safe", "latex_free", "chemo_rated", "en_455", "en_374"] as const;
/** Canonical certification slugs (same allowed set as legacy `compliance_certifications`). */
export const CERTIFICATION_VALUES = COMPLIANCE_VALUES;
export const USES_VALUES = [
  "general_purpose",
  "medical_exam",
  "patient_care",
  "food_handling",
  "laboratory",
  "chemical_handling",
  "industrial_maintenance",
  "cleanroom",
] as const;
export const PROTECTION_TAGS_VALUES = [
  "chemical_resistant",
  "puncture_resistant",
  "viral_barrier",
  "biohazard",
  "static_control",
  "grip_enhanced",
  "abrasion_enhanced",
] as const;
export const TEXTURE_VALUES = ["smooth", "fingertip_textured", "fully_textured"] as const;
export const CUFF_STYLE_VALUES = ["beaded_cuff", "non_beaded", "extended_cuff"] as const;
export const HAND_ORIENTATION_VALUES = ["ambidextrous"] as const;
export const PACKAGING_VALUES = ["box_100_ct", "box_200_250_ct", "case_1000_ct", "case_2000_plus_ct"] as const;
export const STERILITY_VALUES = ["non_sterile", "sterile"] as const;
export const CUT_LEVEL_ANSI_VALUES = ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8", "a9"] as const;
export const PUNCTURE_LEVEL_VALUES = ["p1", "p2", "p3", "p4", "p5"] as const;
export const ABRASION_LEVEL_VALUES = ["level_1", "level_2", "level_3", "level_4"] as const;
export const FLAME_RESISTANT_VALUES = ["flame_resistant"] as const;
export const ARC_RATING_VALUES = ["category_1", "category_2", "category_3", "category_4", "cal_8", "cal_12", "cal_20"] as const;
export const WARM_COLD_WEATHER_VALUES = ["insulated", "winter"] as const;

export type AllowedValueSlug =
  | CategorySlug
  | (typeof MATERIAL_VALUES)[number]
  | (typeof SIZE_VALUES)[number]
  | (typeof COLOR_VALUES)[number]
  | (typeof THICKNESS_MIL_VALUES)[number]
  | (typeof POWDER_VALUES)[number]
  | (typeof GRADE_VALUES)[number]
  | (typeof INDUSTRIES_VALUES)[number]
  | (typeof COMPLIANCE_VALUES)[number]
  | (typeof CERTIFICATION_VALUES)[number]
  | (typeof USES_VALUES)[number]
  | (typeof PROTECTION_TAGS_VALUES)[number]
  | (typeof TEXTURE_VALUES)[number]
  | (typeof CUFF_STYLE_VALUES)[number]
  | (typeof HAND_ORIENTATION_VALUES)[number]
  | (typeof PACKAGING_VALUES)[number]
  | (typeof STERILITY_VALUES)[number]
  | (typeof CUT_LEVEL_ANSI_VALUES)[number]
  | (typeof PUNCTURE_LEVEL_VALUES)[number]
  | (typeof ABRASION_LEVEL_VALUES)[number]
  | (typeof FLAME_RESISTANT_VALUES)[number]
  | (typeof ARC_RATING_VALUES)[number]
  | (typeof WARM_COLD_WEATHER_VALUES)[number]
  | string;

// -----------------------------------------------------------------------------
// Normalized filter attributes (single-select vs multi-select)
// Single-select: one value. Multi-select: array (industries, certifications, uses, protection_tags).
// -----------------------------------------------------------------------------
export interface NormalizedDisposableGloveAttributes {
  category: CategorySlug;
  material: (typeof MATERIAL_VALUES)[number];
  size: (typeof SIZE_VALUES)[number];
  color: (typeof COLOR_VALUES)[number];
  brand: string;
  price_range?: string;
  thickness_mil?: (typeof THICKNESS_MIL_VALUES)[number];
  powder?: (typeof POWDER_VALUES)[number];
  grade?: (typeof GRADE_VALUES)[number];
  industries?: (typeof INDUSTRIES_VALUES)[number][];
  certifications?: (typeof CERTIFICATION_VALUES)[number][];
  uses?: (typeof USES_VALUES)[number][];
  protection_tags?: (typeof PROTECTION_TAGS_VALUES)[number][];
  /** @deprecated Use `certifications`; retained for reading legacy payloads only. */
  compliance_certifications?: (typeof COMPLIANCE_VALUES)[number][];
  texture?: (typeof TEXTURE_VALUES)[number];
  cuff_style?: (typeof CUFF_STYLE_VALUES)[number];
  hand_orientation?: (typeof HAND_ORIENTATION_VALUES)[number];
  packaging?: (typeof PACKAGING_VALUES)[number];
  sterility?: (typeof STERILITY_VALUES)[number];
}

export interface NormalizedWorkGloveAttributes {
  category: CategorySlug;
  material?: (typeof MATERIAL_VALUES)[number];
  size: (typeof SIZE_VALUES)[number];
  color: (typeof COLOR_VALUES)[number];
  brand: string;
  price_range?: string;
  cut_level_ansi?: (typeof CUT_LEVEL_ANSI_VALUES)[number];
  puncture_level?: (typeof PUNCTURE_LEVEL_VALUES)[number];
  abrasion_level?: (typeof ABRASION_LEVEL_VALUES)[number];
  flame_resistant?: (typeof FLAME_RESISTANT_VALUES)[number];
  arc_rating?: (typeof ARC_RATING_VALUES)[number];
  warm_cold_weather?: (typeof WARM_COLD_WEATHER_VALUES)[number];
}

// -----------------------------------------------------------------------------
// Normalized product content (non-filter fields for ingestion)
// -----------------------------------------------------------------------------
/** Price basis for case-cost normalization (each, box, pack, case, etc.). */
export type PriceBasis = "each" | "pair" | "pack" | "box" | "carton" | "case";

/** Normalized pricing for case-only selling: supplier amount/basis → normalized_case_cost. */
export interface NormalizedPricing {
  supplier_price_amount: number;
  supplier_price_basis: PriceBasis;
  sell_unit: "case";
  boxes_per_case?: number | null;
  packs_per_case?: number | null;
  eaches_per_box?: number | null;
  eaches_per_case?: number | null;
  normalized_case_cost: number | null;
  computed_case_qty?: number | null;
  pricing_confidence: number;
  pricing_notes?: string[];
  conversion_formula?: string;
}

export interface NormalizedProductContent {
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
  /** When set, use for markup/sell price (case cost). */
  normalized_case_cost?: number | null;
  pricing?: NormalizedPricing;
  images: string[];
  /** Absolute URLs to spec sheets, SDS, or technical PDFs (import evidence only). */
  spec_sheet_urls?: string[];
  stock_status?: string;
  case_qty?: number;
  box_qty?: number;
  lead_time_days?: number;
  /** From supplier file / CSV mapping (staging + offers). */
  uom?: string;
  pack_size?: string;
  category_guess?: string;
}

// -----------------------------------------------------------------------------
// Full normalized supplier product payload (ingestion output)
// -----------------------------------------------------------------------------
export interface NormalizedSupplierProductPayload {
  content: NormalizedProductContent;
  category_slug: CategorySlug;
  filter_attributes: NormalizedDisposableGloveAttributes | NormalizedWorkGloveAttributes;
}

// -----------------------------------------------------------------------------
// Requirement level (from category_attribute_requirements)
// -----------------------------------------------------------------------------
export type RequirementLevel = "required" | "strongly_preferred";

// -----------------------------------------------------------------------------
// Display group (for storefront filter grouping)
// -----------------------------------------------------------------------------
export type DisplayGroup = "universal" | "disposable_specs" | "work_glove_specs";

// -----------------------------------------------------------------------------
// Cardinality: single = one value; multi = array
// -----------------------------------------------------------------------------
export type AttributeCardinality = "single" | "multi";
