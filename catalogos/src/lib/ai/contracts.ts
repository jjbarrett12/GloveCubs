/**
 * Service contracts for AI extraction and AI matching.
 * Implementations can be OpenAI, Gemini, or mock; orchestration depends only on these interfaces.
 */

import type { AIExtractionInput, AIExtractionOutput } from "./types";
import type { AIMatchingInput, AIMatchingOutput } from "./types";

export interface AIExtractionService {
  /**
   * Run AI-assisted attribute extraction. Used only when rules extraction confidence is low.
   * Returns structured output (category, attributes, confidence, explanation, suggested title).
   * On failure (timeout, invalid JSON, validation error), throw or return null; caller keeps rules-only result.
   */
  extract(input: AIExtractionInput): Promise<AIExtractionOutput | null>;
}

export interface AIMatchingService {
  /**
   * Run AI-assisted matching. Used only when rules match confidence is low.
   * Returns suggested master product id or no-match, confidence, explanation.
   * On failure, throw or return null; caller keeps rules-only match.
   */
  match(input: AIMatchingInput): Promise<AIMatchingOutput | null>;
}
