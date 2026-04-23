/**
 * Orchestration: rules first, AI second.
 * Invokes AI extraction only when rules extraction confidence < threshold;
 * invokes AI matching only when rules match confidence < threshold.
 * Merges results, sets explainability fields, and adds AI_SUGGESTED_NEEDS_REVIEW when AI was used.
 */

import type { ParsedRow } from "./types";
import type { GloveAttributes, NormalizedData, MatchResult } from "./types";
import type { AIExtractionOutput, AIMatchingOutput } from "@/lib/ai/types";
import { extractGloveAttributes } from "./attribute-extraction";
import { buildNormalizedFromRaw } from "./normalize-service";
import { matchToMaster, type MasterProductRow } from "./match-service";
import {
  AI_EXTRACTION_ENABLED,
  AI_MATCHING_ENABLED,
  AI_MATCHING_INLINE_ENABLED,
  EXTRACTION_AI_THRESHOLD,
  MATCH_AI_THRESHOLD,
} from "@/lib/ai/config";
import { createAIExtractionService } from "@/lib/ai/extraction-service";
import { createAIMatchingService } from "@/lib/ai/matching-service";
import type { AIExtractionService } from "@/lib/ai/contracts";
import type { AIMatchingService } from "@/lib/ai/contracts";
import type { AnomalyFlag } from "./types";

export interface ExtractionOutcome {
  attributes: GloveAttributes & Record<string, unknown>;
  productTypeConfidence: number;
  /** When AI was used to fill gaps. */
  aiExtractionUsed: boolean;
  extractionExplanation: string | null;
  aiExtractionResult: AIExtractionOutput | null;
  /** Suggested title from AI when provided. */
  suggestedCanonicalTitle: string | null;
}

export interface MatchingOutcome {
  masterProductId: string | null;
  confidence: number;
  reason: string;
  aiMatchingUsed: boolean;
  matchExplanation: string | null;
  aiMatchResult: AIMatchingOutput | null;
}

export interface AIOrchestrationOptions {
  categoryId: string;
  supplierId: string;
  supplierSku?: string;
  /** Pre-loaded master candidates for AI matching (optional; if not provided, matchToMaster still runs). */
  masterCandidates?: MasterProductRow[];
}

/**
 * Run rules-based extraction; if confidence < threshold and AI enabled, run AI extraction and merge.
 * Rules take precedence where present; AI fills gaps. Sets explanation and ai_used.
 */
export async function runExtractionWithAIFallback(
  rawRow: ParsedRow,
  options: { categoryHint?: string }
): Promise<ExtractionOutcome> {
  const rules = extractGloveAttributes(rawRow);
  const attributes: GloveAttributes & Record<string, unknown> = { ...rules.attributes };

  let aiExtractionUsed = false;
  let extractionExplanation: string | null = null;
  let aiExtractionResult: AIExtractionOutput | null = null;
  let suggestedCanonicalTitle: string | null = null;

  const shouldInvokeAI =
    AI_EXTRACTION_ENABLED && rules.productTypeConfidence < EXTRACTION_AI_THRESHOLD;

  if (shouldInvokeAI) {
    const service: AIExtractionService = createAIExtractionService();
    const aiResult = await service.extract({
      rawRow,
      rulesAttributes: rules.attributes as Record<string, unknown>,
      rulesProductTypeConfidence: rules.productTypeConfidence,
      categoryHint: options.categoryHint,
    });
    if (aiResult) {
      aiExtractionUsed = true;
      aiExtractionResult = aiResult;
      extractionExplanation = aiResult.explanation;
      suggestedCanonicalTitle = aiResult.suggested_canonical_title;
      // Merge: rules take precedence; AI fills only when rules did not set the field
      for (const { key, value } of aiResult.extracted_attributes) {
        if (value == null) continue;
        const existing = attributes[key];
        if (existing === undefined || existing === null) {
          (attributes as Record<string, unknown>)[key] = value;
        }
      }
      if (aiResult.normalized_category_slug && !attributes.product_type && aiResult.normalized_category_slug === "disposable_gloves") {
        attributes.product_type = "disposable_gloves";
      }
      for (const flag of aiResult.inferred_flags) {
        if (flag === "medical_grade" || flag === "food_safe") (attributes as Record<string, unknown>)[flag] = true;
      }
    }
  }

  return {
    attributes,
    productTypeConfidence: rules.productTypeConfidence,
    aiExtractionUsed,
    extractionExplanation,
    aiExtractionResult,
    suggestedCanonicalTitle,
  };
}

/**
 * Run rules-based matching; if confidence < threshold and AI enabled, run AI matching and optionally use suggestion.
 * Sets match explanation and ai_used. Caller must add AI_SUGGESTED_NEEDS_REVIEW when aiMatchingUsed.
 */
export async function runMatchingWithAIFallback(
  normalized: NormalizedData,
  options: AIOrchestrationOptions
): Promise<MatchingOutcome> {
  const rulesMatch = await matchToMaster({
    normalized,
    categoryId: options.categoryId,
    supplierSku: options.supplierSku ?? normalized.sku,
    masterCandidates: options.masterCandidates,
  });

  let aiMatchingUsed = false;
  let matchExplanation: string | null = null;
  let aiMatchResult: AIMatchingOutput | null = null;
  let masterProductId = rulesMatch.masterProductId;
  let confidence = rulesMatch.confidence;
  let reason = rulesMatch.reason;

  const shouldInvokeAI =
    AI_MATCHING_INLINE_ENABLED &&
    AI_MATCHING_ENABLED &&
    rulesMatch.confidence < MATCH_AI_THRESHOLD;

  if (shouldInvokeAI) {
    const candidates = options.masterCandidates ?? (await loadMasterCandidates(options.categoryId));
    const service: AIMatchingService = createAIMatchingService();
    const aiResult = await service.match({
      normalizedName: normalized.name ?? "",
      normalizedSku: normalized.sku ?? null,
      normalizedAttributes: (normalized.attributes ?? {}) as Record<string, unknown>,
      categoryId: options.categoryId,
      candidateSummaries: candidates.map((c) => ({ id: c.id, sku: c.sku, name: c.name })),
      rulesMatchReason: rulesMatch.reason,
      rulesMatchConfidence: rulesMatch.confidence,
    });
    if (aiResult) {
      aiMatchingUsed = true;
      aiMatchResult = aiResult;
      matchExplanation = aiResult.explanation;
      const validCandidateIds = new Set(candidates.map((c) => c.id));
      if (
        aiResult.suggested_master_product_id &&
        validCandidateIds.has(aiResult.suggested_master_product_id) &&
        aiResult.match_confidence > confidence
      ) {
        masterProductId = aiResult.suggested_master_product_id;
        confidence = aiResult.match_confidence;
        reason = "ai_suggested";
      }
    }
  }

  return {
    masterProductId,
    confidence,
    reason,
    aiMatchingUsed,
    matchExplanation,
    aiMatchResult,
  };
}

async function loadMasterCandidates(categoryId: string): Promise<MasterProductRow[]> {
  const { getSupabaseCatalogos } = await import("@/lib/db/client");
  const supabase = getSupabaseCatalogos(true);
  const { data } = await supabase
    .from("products")
    .select("id, sku, name, category_id, attributes")
    .eq("category_id", categoryId)
    .eq("is_active", true);
  return (data ?? []) as MasterProductRow[];
}

/**
 * Build anomaly flags for the pipeline. Append AI_SUGGESTED_NEEDS_REVIEW when AI was used.
 */
export function addAIReviewWarning(
  existingFlags: AnomalyFlag[],
  aiExtractionUsed: boolean,
  aiMatchingUsed: boolean
): AnomalyFlag[] {
  if (!aiExtractionUsed && !aiMatchingUsed) return existingFlags;
  return [
    ...existingFlags,
    {
      code: "AI_SUGGESTED_NEEDS_REVIEW",
      message: "AI-assisted; verify before publish.",
      severity: "warning",
    },
  ];
}
