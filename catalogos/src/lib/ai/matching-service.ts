/**
 * AI-assisted product matching. Implements AIMatchingService.
 * Invoked only when rules match confidence is below threshold.
 * Returns null on failure so pipeline keeps rules-only result.
 */

import type { AIMatchingService } from "./contracts";
import type { AIMatchingInput, AIMatchingOutput } from "./types";
import { aiMatchingOutputSchema } from "./schemas";
import { MATCHING_SYSTEM, buildMatchingPrompt } from "./prompts";
import { structuredCompletion } from "./client";

export function createAIMatchingService(): AIMatchingService {
  return {
    async match(input: AIMatchingInput): Promise<AIMatchingOutput | null> {
      const user = buildMatchingPrompt(input);
      const parsed = await structuredCompletion({
        system: MATCHING_SYSTEM,
        user,
        schema: aiMatchingOutputSchema,
        maxRetries: 1,
      });
      if (!parsed) return null;
      return {
        suggested_master_product_id: parsed.suggested_master_product_id,
        match_confidence: parsed.match_confidence,
        explanation: parsed.explanation,
        no_match_recommendation: parsed.no_match_recommendation,
        possible_duplicate: parsed.possible_duplicate,
      };
    },
  };
}
