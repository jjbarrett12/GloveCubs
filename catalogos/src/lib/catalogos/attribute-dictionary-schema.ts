/**
 * Zod schemas for attribute dictionary and normalized ingestion output.
 * Validates payloads before staging and enforces controlled allowed values.
 */

import { z } from "zod";
import { IMPLEMENTED_PRODUCT_TYPE_KEYS } from "@/lib/product-types";
import {
  MATERIAL_VALUES,
  SIZE_VALUES,
  COLOR_VALUES,
  THICKNESS_MIL_VALUES,
  POWDER_VALUES,
  GRADE_VALUES,
  INDUSTRIES_VALUES,
  COMPLIANCE_VALUES,
  CERTIFICATION_VALUES,
  USES_VALUES,
  PROTECTION_TAGS_VALUES,
  TEXTURE_VALUES,
  CUFF_STYLE_VALUES,
  HAND_ORIENTATION_VALUES,
  PACKAGING_VALUES,
  STERILITY_VALUES,
  CUT_LEVEL_ANSI_VALUES,
  PUNCTURE_LEVEL_VALUES,
  ABRASION_LEVEL_VALUES,
  FLAME_RESISTANT_VALUES,
  ARC_RATING_VALUES,
  WARM_COLD_WEATHER_VALUES,
} from "./attribute-dictionary-types";

// -----------------------------------------------------------------------------
// Content (non-filter) fields
// -----------------------------------------------------------------------------
export const normalizedProductContentSchema = z.object({
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
  spec_sheet_urls: z.array(z.string().url()).optional(),
  stock_status: z.string().optional(),
  case_qty: z.number().int().positive().optional(),
  box_qty: z.number().int().positive().optional(),
  lead_time_days: z.number().int().min(0).optional(),
  uom: z.string().optional(),
  pack_size: z.string().optional(),
  category_guess: z.string().optional(),
});

// -----------------------------------------------------------------------------
// Disposable glove filter attributes (controlled values)
// -----------------------------------------------------------------------------
export const normalizedDisposableGloveAttributesSchema = z.object({
  category: z.enum(IMPLEMENTED_PRODUCT_TYPE_KEYS),
  material: z.enum(MATERIAL_VALUES),
  size: z.enum(SIZE_VALUES),
  color: z.enum(COLOR_VALUES),
  brand: z.string().min(1),
  price_range: z.string().optional(),
  thickness_mil: z.enum(THICKNESS_MIL_VALUES).optional(),
  powder: z.enum(POWDER_VALUES).optional(),
  grade: z.enum(GRADE_VALUES).optional(),
  industries: z.array(z.enum(INDUSTRIES_VALUES)).optional(),
  certifications: z.array(z.enum(CERTIFICATION_VALUES)).optional(),
  uses: z.array(z.enum(USES_VALUES)).optional(),
  protection_tags: z.array(z.enum(PROTECTION_TAGS_VALUES)).optional(),
  /** @deprecated Use `certifications`. */
  compliance_certifications: z.array(z.enum(COMPLIANCE_VALUES)).optional(),
  texture: z.enum(TEXTURE_VALUES).optional(),
  cuff_style: z.enum(CUFF_STYLE_VALUES).optional(),
  hand_orientation: z.enum(HAND_ORIENTATION_VALUES).optional(),
  packaging: z.enum(PACKAGING_VALUES).optional(),
  sterility: z.enum(STERILITY_VALUES).optional(),
});

// -----------------------------------------------------------------------------
// Work glove filter attributes
// -----------------------------------------------------------------------------
export const normalizedWorkGloveAttributesSchema = z.object({
  category: z.enum(IMPLEMENTED_PRODUCT_TYPE_KEYS),
  material: z.enum(MATERIAL_VALUES).optional(),
  size: z.enum(SIZE_VALUES),
  color: z.enum(COLOR_VALUES),
  brand: z.string().min(1),
  price_range: z.string().optional(),
  cut_level_ansi: z.enum(CUT_LEVEL_ANSI_VALUES).optional(),
  puncture_level: z.enum(PUNCTURE_LEVEL_VALUES).optional(),
  abrasion_level: z.enum(ABRASION_LEVEL_VALUES).optional(),
  flame_resistant: z.enum(FLAME_RESISTANT_VALUES).optional(),
  arc_rating: z.enum(ARC_RATING_VALUES).optional(),
  warm_cold_weather: z.enum(WARM_COLD_WEATHER_VALUES).optional(),
});

// -----------------------------------------------------------------------------
// Full normalized supplier product payload
// -----------------------------------------------------------------------------
export const normalizedSupplierProductPayloadSchema = z.object({
  content: normalizedProductContentSchema,
  category_slug: z.enum(IMPLEMENTED_PRODUCT_TYPE_KEYS),
  filter_attributes: z.union([
    normalizedDisposableGloveAttributesSchema,
    normalizedWorkGloveAttributesSchema,
  ]),
});

export type NormalizedProductContentParsed = z.infer<typeof normalizedProductContentSchema>;
export type NormalizedDisposableGloveAttributesParsed = z.infer<typeof normalizedDisposableGloveAttributesSchema>;
export type NormalizedWorkGloveAttributesParsed = z.infer<typeof normalizedWorkGloveAttributesSchema>;
export type NormalizedSupplierProductPayloadParsed = z.infer<typeof normalizedSupplierProductPayloadSchema>;
