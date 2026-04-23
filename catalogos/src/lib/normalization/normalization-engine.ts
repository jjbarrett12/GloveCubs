/**
 * Supplier-ingestion normalization engine against the approved attribute dictionary.
 * Rules first; only dictionary-allowed values; unknown values → review flags.
 * File: catalogos/src/lib/normalization/normalization-engine.ts
 */

import type { NormalizedProductContent } from "@/lib/catalogos/attribute-dictionary-types";
import type { NormalizedDisposableGloveAttributes, NormalizedWorkGloveAttributes } from "@/lib/catalogos/attribute-dictionary-types";
import { stageSafe } from "@/lib/catalogos/validation-modes";
import { extractContentFromRaw } from "./normalization-utils";
import { inferCategoryWithResult, CATEGORY_CONFIDENCE_THRESHOLD } from "./category-inference";
import { normalizeToCaseCost } from "@/lib/pricing/case-cost-normalization";
import {
  extractDisposableGloveAttributes,
  extractWorkGloveAttributes,
} from "./extract-attributes-dictionary";
import type { NormalizationResult, ReviewFlag, NormalizationEngineOptions } from "./types";
import type { SynonymMapOption } from "./synonym-lookup";
import { getIngestionExtractorId } from "@/lib/product-types";

const DEFAULT_LOW_CONFIDENCE_THRESHOLD = 0.6;

export interface NormalizationEngineOptionsWithDict extends NormalizationEngineOptions {
  /** DB-backed + in-memory merged synonym map (from dictionary-service loadSynonymMap). */
  synonymMap?: SynonymMapOption;
}

/**
 * Run full normalization: content + category + dictionary-only attributes + validation + flags.
 */
export function runNormalization(
  rawRow: Record<string, unknown>,
  options: NormalizationEngineOptionsWithDict = {}
): NormalizationResult {
  const lowConfidenceThreshold = options.lowConfidenceThreshold ?? DEFAULT_LOW_CONFIDENCE_THRESHOLD;
  const synonymMap = options.synonymMap;

  let content = extractContentFromRaw(rawRow) as NormalizedProductContent;
  const pricingResult = normalizeToCaseCost({
    raw: rawRow,
    supplier_cost: content.supplier_cost,
    case_qty: content.case_qty,
    box_qty: content.box_qty,
  });
  content = {
    ...content,
    pricing: {
      supplier_price_amount: pricingResult.supplier_price_amount,
      supplier_price_basis: pricingResult.supplier_price_basis,
      sell_unit: pricingResult.sell_unit,
      boxes_per_case: pricingResult.boxes_per_case,
      packs_per_case: pricingResult.packs_per_case,
      eaches_per_box: pricingResult.eaches_per_box,
      eaches_per_case: pricingResult.eaches_per_case,
      normalized_case_cost: pricingResult.normalized_case_cost,
      computed_case_qty: pricingResult.computed_case_qty,
      pricing_confidence: pricingResult.pricing_confidence,
      pricing_notes: pricingResult.pricing_notes,
      conversion_formula: pricingResult.conversion_formula,
    },
    normalized_case_cost: pricingResult.normalized_case_cost,
    supplier_cost: pricingResult.normalized_case_cost ?? content.supplier_cost,
  };
  const categoryInference = inferCategoryWithResult(rawRow, options.categoryHint);
  const category_slug = categoryInference.category_slug;

  const extractorId = getIngestionExtractorId(category_slug);
  const extraction =
    extractorId === "disposable_glove_dictionary"
      ? extractDisposableGloveAttributes(rawRow, { synonymMap })
      : extractWorkGloveAttributes(rawRow, { synonymMap });

  const filter_attributes = extraction.attributes as Partial<NormalizedDisposableGloveAttributes> | Partial<NormalizedWorkGloveAttributes>;
  if (content.brand && !filter_attributes.brand) {
    (filter_attributes as { brand?: string }).brand = content.brand;
    if (!extraction.confidenceByKey.brand) extraction.confidenceByKey.brand = 0.7;
  }
  const confidence_by_key = extraction.confidenceByKey;
  const unmapped_values = extraction.unmapped ?? [];

  const stageValidation = stageSafe(category_slug as "disposable_gloves" | "reusable_work_gloves", filter_attributes);

  const review_flags: ReviewFlag[] = [];

  if (categoryInference.confidence < CATEGORY_CONFIDENCE_THRESHOLD) {
    review_flags.push({
      code: "low_category_confidence",
      message: `Category inferred as ${category_slug} with low confidence (${categoryInference.confidence.toFixed(2)}): ${categoryInference.reason}`,
      severity: "warning",
    });
  }
  if (categoryInference.ambiguous_candidates.length > 1) {
    review_flags.push({
      code: "ambiguous_category",
      message: `Ambiguous category: candidates ${categoryInference.ambiguous_candidates.join(", ")}. Using ${category_slug}.`,
      severity: "warning",
    });
  }

  for (const key of stageValidation.missing_required) {
    review_flags.push({
      code: "missing_required",
      message: `Missing required attribute for ${category_slug}: ${key}`,
      severity: "error",
      attribute_key: key,
    });
  }
  for (const key of stageValidation.missing_strongly_preferred) {
    review_flags.push({
      code: "missing_strongly_preferred",
      message: `Missing strongly preferred attribute: ${key}`,
      severity: "warning",
      attribute_key: key,
    });
  }
  for (const u of unmapped_values) {
    review_flags.push({
      code: "unmapped_value",
      message: `Raw value not in dictionary: ${u.attribute_key}=${u.raw_value}`,
      severity: "warning",
      attribute_key: u.attribute_key,
      raw_value: u.raw_value,
    });
  }
  for (const [key, conf] of Object.entries(confidence_by_key)) {
    if (conf < lowConfidenceThreshold && conf > 0) {
      review_flags.push({
        code: "low_confidence",
        message: `Low confidence (${conf.toFixed(2)}) for attribute: ${key}`,
        severity: "warning",
        attribute_key: key,
      });
    }
  }
  for (const f of pricingResult.flags) {
    review_flags.push(f as ReviewFlag);
  }

  return {
    content,
    category_slug,
    category_inference: {
      category_slug: categoryInference.category_slug,
      confidence: categoryInference.confidence,
      reason: categoryInference.reason,
      ambiguous_candidates: categoryInference.ambiguous_candidates,
    },
    filter_attributes,
    confidence_by_key: confidence_by_key,
    unmapped_values,
    review_flags,
  };
}
