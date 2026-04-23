/**
 * Normalization engine types: review flags and engine output.
 * File: catalogos/src/lib/normalization/types.ts
 */

import type {
  CategorySlug,
  NormalizedProductContent,
  NormalizedDisposableGloveAttributes,
  NormalizedWorkGloveAttributes,
} from "@/lib/catalogos/attribute-dictionary-types";

export type ReviewFlagCode =
  | "missing_required"
  | "missing_strongly_preferred"
  | "unmapped_value"
  | "low_confidence"
  | "low_category_confidence"
  | "ambiguous_category"
  | "missing_case_conversion_data"
  | "ambiguous_price_basis"
  | "inconsistent_case_quantity"
  | "invalid_supplier_price";

export interface ReviewFlag {
  code: ReviewFlagCode;
  message: string;
  severity: "warning" | "error";
  attribute_key?: string;
  raw_value?: string;
}

/** Category inference detail for staging and review. */
export interface CategoryInferenceDetail {
  category_slug: CategorySlug;
  confidence: number;
  reason: string;
  ambiguous_candidates: CategorySlug[];
}

export interface NormalizationResult {
  content: NormalizedProductContent;
  category_slug: CategorySlug;
  /** Structured category inference (confidence, reason, ambiguous_candidates). */
  category_inference: CategoryInferenceDetail;
  filter_attributes: Partial<NormalizedDisposableGloveAttributes> | Partial<NormalizedWorkGloveAttributes>;
  confidence_by_key: Record<string, number>;
  unmapped_values: { attribute_key: string; raw_value: string }[];
  review_flags: ReviewFlag[];
}

export interface NormalizationEngineOptions {
  categoryHint?: CategorySlug;
  lowConfidenceThreshold?: number;
}
