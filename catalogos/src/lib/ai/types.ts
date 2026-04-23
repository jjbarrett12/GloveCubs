/**
 * Input/output types for AI extraction and matching.
 * Used by service contracts and orchestration.
 */

/** Raw row shape from parser (before normalization). */
export type RawRow = Record<string, unknown>;

/** Rules-based extraction result (before optional AI). */
export interface RulesExtractionResult {
  attributes: Record<string, unknown>;
  productTypeConfidence: number;
}

/** Input to AI extraction: raw row + rules result so AI can fill gaps. */
export interface AIExtractionInput {
  rawRow: RawRow;
  rulesAttributes: Record<string, unknown>;
  rulesProductTypeConfidence: number;
  /** Category slug if already known from rules/feed. */
  categoryHint?: string;
}

/** Single extracted attribute from AI (key + value + optional confidence). */
export interface AIExtractedAttribute {
  key: string;
  value: string | number | boolean | null;
  confidence?: number;
}

/** Structured output from AI extraction. */
export interface AIExtractionOutput {
  normalized_category_slug: string | null;
  extracted_attributes: AIExtractedAttribute[];
  extraction_confidence: number;
  explanation: string;
  suggested_canonical_title: string | null;
  /** e.g. food_safe, medical_grade when unclear from text. */
  inferred_flags: string[];
}

/** Input to AI matching: normalized row + candidate summaries (no PII). */
export interface AIMatchingInput {
  normalizedName: string;
  normalizedSku: string | null;
  normalizedAttributes: Record<string, unknown>;
  categoryId: string;
  /** Candidate master products: id, sku, name (for context only). */
  candidateSummaries: { id: string; sku: string; name: string }[];
  /** Why rules matching was inconclusive (e.g. no UPC, partial overlap). */
  rulesMatchReason: string;
  rulesMatchConfidence: number;
}

/** Structured output from AI matching. */
export interface AIMatchingOutput {
  suggested_master_product_id: string | null;
  match_confidence: number;
  explanation: string;
  no_match_recommendation: boolean;
  /** If true, AI suggests this might be a duplicate of an existing product. */
  possible_duplicate: boolean;
}
