/**
 * Zod schemas for validated normalized ingestion output.
 * Ensures every extractable field and filter attribute is validated before staging.
 */

import { z } from "zod";
import { IMPLEMENTED_PRODUCT_TYPE_KEYS } from "@/lib/product-types";
import {
  CATEGORY_SLUGS,
  MATERIAL_OPTIONS,
  SIZE_OPTIONS,
  COLOR_OPTIONS,
  THICKNESS_MIL_OPTIONS,
  POWDER_OPTIONS,
  GRADE_OPTIONS,
  INDUSTRY_OPTIONS,
  COMPLIANCE_OPTIONS,
  TEXTURE_OPTIONS,
  CUFF_STYLE_OPTIONS,
  HAND_ORIENTATION_OPTIONS,
  PACKAGING_OPTIONS,
  STERILITY_OPTIONS,
  CUT_LEVEL_ANSI_OPTIONS,
  PUNCTURE_LEVEL_OPTIONS,
  ABRASION_LEVEL_OPTIONS,
  ARC_RATING_OPTIONS,
  WARM_COLD_WEATHER_OPTIONS,
} from "./filter-attributes";

const categorySlugSchema = z.enum(CATEGORY_SLUGS);
/** Product's category (excludes all_categories which is filter-only). */
const productCategorySlugSchema = z.enum(IMPLEMENTED_PRODUCT_TYPE_KEYS).or(z.string());
const materialSchema = z.enum(MATERIAL_OPTIONS).or(z.string());
const sizeSchema = z.enum(SIZE_OPTIONS).or(z.string());
const colorSchema = z.enum(COLOR_OPTIONS).or(z.string());

export const filterAttributesSchema = z.object({
  price_range: z.string().optional(),
  category: categorySlugSchema.optional(),
  material: materialSchema.optional(),
  size: sizeSchema.optional(),
  color: colorSchema.optional(),
  brand: z.string().optional(),
  thickness_mil: z.enum(THICKNESS_MIL_OPTIONS).or(z.string()).optional(),
  powder: z.enum(POWDER_OPTIONS).optional(),
  grade: z.enum(GRADE_OPTIONS).optional(),
  industries: z.array(z.enum(INDUSTRY_OPTIONS).or(z.string())).optional(),
  compliance_certifications: z.array(z.enum(COMPLIANCE_OPTIONS).or(z.string())).optional(),
  texture: z.enum(TEXTURE_OPTIONS).optional(),
  cuff_style: z.enum(CUFF_STYLE_OPTIONS).optional(),
  hand_orientation: z.enum(HAND_ORIENTATION_OPTIONS).optional(),
  packaging: z.enum(PACKAGING_OPTIONS).optional(),
  sterility: z.enum(STERILITY_OPTIONS).optional(),
  cut_level_ansi: z.enum(CUT_LEVEL_ANSI_OPTIONS).or(z.string()).optional(),
  puncture_level: z.enum(PUNCTURE_LEVEL_OPTIONS).optional(),
  abrasion_level: z.enum(ABRASION_LEVEL_OPTIONS).optional(),
  flame_resistant: z.string().optional(),
  arc_rating: z.enum(ARC_RATING_OPTIONS).optional(),
  warm_cold_weather: z.enum(WARM_COLD_WEATHER_OPTIONS).optional(),
}).strict();

export const normalizedProductCoreSchema = z.object({
  canonical_title: z.string().min(1),
  short_description: z.string().optional(),
  long_description: z.string().optional(),
  product_details: z.string().optional(),
  specifications: z.record(z.string()).optional(),
  bullets: z.array(z.string()).optional(),
  brand: z.string().optional(),
  manufacturer_part_number: z.string().optional(),
  supplier_sku: z.string().min(1),
  upc: z.string().optional(),
  supplier_cost: z.number().min(0),
  images: z.array(z.string().url()).default([]),
  stock_status: z.string().optional(),
  case_qty: z.number().int().positive().optional(),
  box_qty: z.number().int().positive().optional(),
  lead_time_days: z.number().int().min(0).optional(),
});

export const normalizedProductSchema = normalizedProductCoreSchema.and(
  z.object({
    category_slug: productCategorySlugSchema,
    filter_attributes: filterAttributesSchema.default({}),
  })
);

export const reviewFlagSchema = z.object({
  flag_type: z.string(),
  attribute_key: z.string().optional(),
  message: z.string(),
  severity: z.enum(["warning", "error"]),
  payload: z.record(z.unknown()).optional(),
});

export type FilterAttributesParsed = z.infer<typeof filterAttributesSchema>;
export type NormalizedProductCoreParsed = z.infer<typeof normalizedProductCoreSchema>;
export type NormalizedProductParsed = z.infer<typeof normalizedProductSchema>;
export type ReviewFlagParsed = z.infer<typeof reviewFlagSchema>;
