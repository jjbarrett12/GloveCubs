/**
 * Product identity and resolution graph types.
 */

export type ResolutionMatchType = "family" | "variant" | "offer" | "duplicate" | "new_product";

export type ResolutionCandidateStatus = "pending" | "approved" | "rejected" | "superseded";

export interface ResolutionCandidate {
  candidate_family_id: string | null;
  candidate_product_id: string | null;
  match_type: ResolutionMatchType;
  confidence: number;
  reasons: string[];
}

export interface NormalizedRowForResolution {
  id: string;
  batch_id: string;
  supplier_id: string;
  normalized_data: Record<string, unknown>;
  attributes: Record<string, unknown>;
  inferred_base_sku?: string | null;
  inferred_size?: string | null;
  family_group_key?: string | null;
}

/** Minimum confidence to auto-attach (only when evidence is strong). */
export const RESOLUTION_AUTO_ATTACH_THRESHOLD = 0.92;

/** Below this, never auto-merge. */
export const RESOLUTION_MIN_CONFIDENCE = 0.5;

/** Reasons that are safe for auto-attach (exact or high-confidence pattern). */
export const RESOLUTION_AUTO_ATTACH_REASONS = [
  "prior_admin_decision",
  "exact_supplier_offer",
  "exact_variant_sku",
  "sku_pattern_family_and_size",
] as const;

export type ResolutionAutoAttachReason = (typeof RESOLUTION_AUTO_ATTACH_REASONS)[number];

/** Reason strings emitted by the resolution engine. */
export const RESOLUTION_REASONS = {
  PRIOR_DECISION: "prior_admin_decision",
  EXACT_OFFER: "exact_supplier_offer",
  EXACT_VARIANT_SKU: "exact_variant_sku",
  SKU_PATTERN_FAMILY: "sku_pattern_family",
  SKU_PATTERN_FAMILY_AND_SIZE: "sku_pattern_family_and_size",
  FAMILY_BASE_SKU: "family_base_sku",
  FAMILY_BASE_SKU_AND_SIZE: "family_base_sku_and_size",
  SIMILARITY: "similarity_brand_title_attributes",
  NO_MATCH: "no_match",
} as const;
