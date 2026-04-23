/**
 * GloveCubs storefront filter attribute keys and allowed values.
 * Product-type facet keys come from `@/lib/product-types`; this file keeps value enums
 * aligned with DB dictionary seeds.
 */

import { IMPLEMENTED_PRODUCT_TYPE_KEYS, getFilterableFacets } from "@/lib/product-types";

/** Includes pseudo `all_categories` for UI; persisted products use registry keys only. */
export const CATEGORY_SLUGS = ["all_categories", ...IMPLEMENTED_PRODUCT_TYPE_KEYS] as const;
/** Storefront URL/query category param (includes `all_categories`). */
export type StorefrontCategoryParam = (typeof CATEGORY_SLUGS)[number];

export const MATERIAL_OPTIONS = ["nitrile", "latex", "vinyl", "polyethylene_pe"] as const;
export type MaterialOption = (typeof MATERIAL_OPTIONS)[number];

export const SIZE_OPTIONS = ["xs", "s", "m", "l", "xl", "xxl"] as const;
export type SizeOption = (typeof SIZE_OPTIONS)[number];

export const COLOR_OPTIONS = [
  "blue", "purple", "black", "white", "light_blue", "orange", "violet",
  "green", "tan", "gray", "beige", "yellow", "brown", "pink", "clear",
] as const;
export type ColorOption = (typeof COLOR_OPTIONS)[number];

/** Disposable glove: thickness filter values — all thicknesses listed (no 7+ catch-all). */
export const THICKNESS_MIL_OPTIONS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20"] as const;
export type ThicknessMilOption = (typeof THICKNESS_MIL_OPTIONS)[number];

export const POWDER_OPTIONS = ["powder_free", "powdered"] as const;
export type PowderOption = (typeof POWDER_OPTIONS)[number];

export const GRADE_OPTIONS = ["medical_exam_grade", "industrial_grade", "food_service_grade"] as const;
export type GradeOption = (typeof GRADE_OPTIONS)[number];

export const INDUSTRY_OPTIONS = [
  "healthcare", "food_service", "food_processing", "janitorial", "sanitation",
  "laboratories", "pharmaceuticals", "beauty_personal_care", "tattoo_body_art", "automotive", "education",
] as const;
export type IndustryOption = (typeof INDUSTRY_OPTIONS)[number];

export const COMPLIANCE_OPTIONS = ["fda_approved", "astm_tested", "food_safe", "latex_free", "chemo_rated", "en_455", "en_374"] as const;
export type ComplianceOption = (typeof COMPLIANCE_OPTIONS)[number];

export const TEXTURE_OPTIONS = ["smooth", "fingertip_textured", "fully_textured"] as const;
export type TextureOption = (typeof TEXTURE_OPTIONS)[number];

export const CUFF_STYLE_OPTIONS = ["beaded_cuff", "non_beaded", "extended_cuff"] as const;
export type CuffStyleOption = (typeof CUFF_STYLE_OPTIONS)[number];

export const HAND_ORIENTATION_OPTIONS = ["ambidextrous"] as const;
export type HandOrientationOption = (typeof HAND_ORIENTATION_OPTIONS)[number];

export const PACKAGING_OPTIONS = ["box_100_ct", "box_200_250_ct", "case_1000_ct", "case_2000_plus_ct"] as const;
export type PackagingOption = (typeof PACKAGING_OPTIONS)[number];

export const STERILITY_OPTIONS = ["non_sterile", "sterile"] as const;
export type SterilityOption = (typeof STERILITY_OPTIONS)[number];

/** Work glove: ANSI cut levels */
export const CUT_LEVEL_ANSI_OPTIONS = ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8", "a9"] as const;
export type CutLevelAnsiOption = (typeof CUT_LEVEL_ANSI_OPTIONS)[number];

export const PUNCTURE_LEVEL_OPTIONS = ["p1", "p2", "p3", "p4", "p5"] as const;
export type PunctureLevelOption = (typeof PUNCTURE_LEVEL_OPTIONS)[number];

export const ABRASION_LEVEL_OPTIONS = ["level_1", "level_2", "level_3", "level_4"] as const;
export type AbrasionLevelOption = (typeof ABRASION_LEVEL_OPTIONS)[number];

export const FLAME_RESISTANT_OPTIONS = ["flame_resistant"] as const;
export const ARC_RATING_OPTIONS = ["category_1", "category_2", "category_3", "category_4", "cal_8", "cal_12", "cal_20"] as const;
export type ArcRatingOption = (typeof ARC_RATING_OPTIONS)[number];

export const WARM_COLD_WEATHER_OPTIONS = ["insulated", "winter"] as const;
export type WarmColdWeatherOption = (typeof WARM_COLD_WEATHER_OPTIONS)[number];

/** Disposable glove filter attributes (keys only) — from product type registry. */
export const DISPOSABLE_GLOVE_FILTER_KEYS = getFilterableFacets("disposable_gloves");

/** Work glove filter attributes (keys only) — from product type registry. */
export const WORK_GLOVE_FILTER_KEYS = getFilterableFacets("reusable_work_gloves");
