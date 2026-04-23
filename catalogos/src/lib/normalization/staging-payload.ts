/**
 * Build and validate staging payload for supplier_products_normalized.
 * Uses Zod to validate normalized output before insert.
 * File: catalogos/src/lib/normalization/staging-payload.ts
 */

import type { NormalizationResult, CategoryInferenceDetail } from "./types";
import type { ReviewFlag } from "./types";
import { parseSafe } from "@/lib/catalogos/validation-modes";
import { z } from "zod";
import type { ImportAutoPricingSnapshot } from "@/lib/ingestion/import-pricing";

/** Pricing snapshot for staging (from case-cost normalization). */
export interface StagingPricing {
  supplier_price_amount: number;
  supplier_price_basis: string;
  sell_unit: string;
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

/** Tier + list pricing computed at import (landed cost → tier sell prices → list). */
export type StagingImportAutoPricing = ImportAutoPricingSnapshot;

/** Payload shape for supplier_products_normalized insert (normalized_data JSONB). */
export interface StagingNormalizedData {
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
  /** Case cost after normalization; use for sell price when present. */
  normalized_case_cost?: number | null;
  pricing?: StagingPricing;
  images: string[];
  stock_status?: string;
  case_qty?: number;
  box_qty?: number;
  lead_time_days?: number;
  /** From supplier file / AI mapping (pre–canonical category). */
  uom?: string;
  pack_size?: string;
  category_guess?: string;
  category_slug: string;
  category_inference?: CategoryInferenceDetail;
  filter_attributes: Record<string, unknown>;
  confidence_by_key?: Record<string, number>;
  unmapped_values?: { attribute_key: string; raw_value: string }[];
  anomaly_flags?: ReviewFlag[];
}

/** Input to buildStagingPayload. */
export interface BuildStagingPayloadInput {
  result: NormalizationResult;
  batchId: string;
  rawId: string;
  supplierId: string;
  matchConfidence?: number | null;
  masterProductId?: string | null;
  /** Additional anomaly flags from pipeline (e.g. missing_image, duplicate_sku). */
  extraAnomalyFlags?: ReviewFlag[];
  /** When set, attached to normalized_data after normalization (import tier pricing). */
  importAutoPricing?: ImportAutoPricingSnapshot | null;
}

/** Output for supplier_products_normalized insert. */
export interface StagingPayload {
  batch_id: string;
  raw_id: string;
  supplier_id: string;
  normalized_data: StagingNormalizedData;
  attributes: Record<string, unknown>;
  match_confidence: number | null;
  master_product_id: string | null;
  status: "pending";
}

const reviewFlagSchema = z.object({
  code: z.string(),
  message: z.string(),
  severity: z.enum(["warning", "error"]),
  attribute_key: z.string().optional(),
  raw_value: z.string().optional(),
});

const stagingPricingSchema = z.object({
  supplier_price_amount: z.number(),
  supplier_price_basis: z.string(),
  sell_unit: z.string(),
  boxes_per_case: z.number().nullable().optional(),
  packs_per_case: z.number().nullable().optional(),
  eaches_per_box: z.number().nullable().optional(),
  eaches_per_case: z.number().nullable().optional(),
  normalized_case_cost: z.number().nullable(),
  computed_case_qty: z.number().nullable().optional(),
  pricing_confidence: z.number(),
  pricing_notes: z.array(z.string()).optional(),
  conversion_formula: z.string().optional(),
});

const importPricingManualOverrideSchema = z
  .object({
    list_price: z.number().optional(),
    tier_a_price: z.number().optional(),
    tier_b_price: z.number().optional(),
    tier_c_price: z.number().optional(),
    tier_d_price: z.number().optional(),
    updated_at: z.string().optional(),
  })
  .strict();

const importAutoPricingSchema = z.object({
  supplier_cost: z.number(),
  shipping_estimate: z.number(),
  payment_fee_estimate: z.number(),
  landed_cost: z.number(),
  tier_a_price: z.number(),
  tier_b_price: z.number(),
  tier_c_price: z.number(),
  tier_d_price: z.number(),
  display_tier_price: z.number(),
  display_tier: z.enum(["A", "B", "C", "D"]),
  list_price: z.number(),
  list_price_multiplier: z.number(),
  pricing_rule_version: z.string(),
  pricing_manual_override: importPricingManualOverrideSchema.nullable().optional(),
});

const stagingNormalizedDataSchema = z.object({
  canonical_title: z.string(),
  short_description: z.string().optional(),
  long_description: z.string().optional(),
  product_details: z.string().optional(),
  specifications: z.record(z.string()).optional(),
  bullets: z.array(z.string()).optional(),
  brand: z.string().optional(),
  manufacturer_part_number: z.string().optional(),
  supplier_sku: z.string(),
  upc: z.string().optional(),
  supplier_cost: z.number(),
  normalized_case_cost: z.number().nullable().optional(),
  pricing: stagingPricingSchema.optional(),
  import_auto_pricing: importAutoPricingSchema.optional(),
  images: z.array(z.string()),
  stock_status: z.string().optional(),
  case_qty: z.number().optional(),
  box_qty: z.number().optional(),
  lead_time_days: z.number().optional(),
  uom: z.string().optional(),
  pack_size: z.string().optional(),
  category_guess: z.string().optional(),
  category_slug: z.string(),
  filter_attributes: z.record(z.unknown()),
  confidence_by_key: z.record(z.number()).optional(),
  unmapped_values: z.array(z.object({ attribute_key: z.string(), raw_value: z.string() })).optional(),
  anomaly_flags: z.array(reviewFlagSchema).optional(),
});

const stagingPayloadSchema = z.object({
  batch_id: z.string().uuid(),
  raw_id: z.string().uuid(),
  supplier_id: z.string().uuid(),
  normalized_data: stagingNormalizedDataSchema,
  attributes: z.record(z.unknown()),
  match_confidence: z.number().min(0).max(1).nullable(),
  master_product_id: z.string().uuid().nullable(),
  status: z.literal("pending"),
});

/**
 * Build staging payload for supplier_products_normalized insert.
 * Merges result content + filter_attributes + flags; validates with Zod.
 */
export function buildStagingPayload(input: BuildStagingPayloadInput): StagingPayload {
  const {
    result,
    batchId,
    rawId,
    supplierId,
    matchConfidence = null,
    masterProductId = null,
    extraAnomalyFlags = [],
    importAutoPricing,
  } = input;

  const anomaly_flags = [...result.review_flags, ...extraAnomalyFlags];

  const normalized_data: StagingNormalizedData = {
    ...result.content,
    category_slug: result.category_slug,
    category_inference: result.category_inference,
    filter_attributes: result.filter_attributes as Record<string, unknown>,
    confidence_by_key: Object.keys(result.confidence_by_key).length > 0 ? result.confidence_by_key : undefined,
    unmapped_values: result.unmapped_values.length > 0 ? result.unmapped_values : undefined,
    anomaly_flags: anomaly_flags.length > 0 ? anomaly_flags : undefined,
    ...(importAutoPricing ? { import_auto_pricing: importAutoPricing } : {}),
  };

  const payload: StagingPayload = {
    batch_id: batchId,
    raw_id: rawId,
    supplier_id: supplierId,
    normalized_data,
    attributes: result.filter_attributes as Record<string, unknown>,
    match_confidence: matchConfidence,
    master_product_id: masterProductId,
    status: "pending",
  };

  return stagingPayloadSchema.parse(payload) as StagingPayload;
}

/**
 * Validate normalized payload with parse_safe: structure and allowed dictionary values only.
 * Does not require required attributes to be present (use publish_safe for that).
 * Throws if structure or any value is invalid.
 */
export function validateNormalizedPayload(result: NormalizationResult): {
  content: NormalizationResult["content"];
  category_slug: NormalizationResult["category_slug"];
  filter_attributes: NormalizationResult["filter_attributes"];
} {
  const parsed = parseSafe({
    content: result.content,
    category_slug: result.category_slug,
    filter_attributes: result.filter_attributes as Record<string, unknown>,
  });
  if (!parsed.valid) {
    throw new Error(`parse_safe validation failed: ${parsed.errors.join("; ")}`);
  }
  return {
    content: result.content,
    category_slug: result.category_slug,
    filter_attributes: result.filter_attributes,
  };
}
