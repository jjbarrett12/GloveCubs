/**
 * AI-assisted attribute extraction. Implements AIExtractionService.
 * Invoked only when rules extraction confidence is below threshold.
 * Returns null on failure so pipeline keeps rules-only result.
 */

import type { AIExtractionService } from "./contracts";
import type { AIExtractionInput, AIExtractionOutput } from "./types";
import { aiExtractionOutputSchema } from "./schemas";
import { EXTRACTION_SYSTEM, buildExtractionPrompt } from "./prompts";
import { structuredCompletion } from "./client";

export function createAIExtractionService(): AIExtractionService {
  return {
    async extract(input: AIExtractionInput): Promise<AIExtractionOutput | null> {
      const user = buildExtractionPrompt(input);
      const parsed = await structuredCompletion({
        system: EXTRACTION_SYSTEM,
        user,
        schema: aiExtractionOutputSchema,
        maxRetries: 1,
      });
      if (!parsed) return null;
      return {
        normalized_category_slug: parsed.normalized_category_slug,
        extracted_attributes: parsed.extracted_attributes,
        extraction_confidence: parsed.extraction_confidence,
        explanation: parsed.explanation,
        suggested_canonical_title: parsed.suggested_canonical_title,
        inferred_flags: parsed.inferred_flags ?? [],
      };
    },
  };
}
