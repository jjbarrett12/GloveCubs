/**
 * CatalogOS AI fallback: extraction and matching.
 * Rules first, AI second. Use via ai-orchestration from ingestion pipeline.
 */

export { AI_EXTRACTION_ENABLED, AI_MATCHING_ENABLED, EXTRACTION_AI_THRESHOLD, MATCH_AI_THRESHOLD } from "./config";
export type { AIExtractionService, AIMatchingService } from "./contracts";
export type {
  AIExtractionInput,
  AIExtractionOutput,
  AIMatchingInput,
  AIMatchingOutput,
  AIExtractedAttribute,
} from "./types";
export { aiExtractionOutputSchema, aiMatchingOutputSchema } from "./schemas";
export type { AIExtractionOutputParsed, AIMatchingOutputParsed } from "./schemas";
export { EXTRACTION_SYSTEM, MATCHING_SYSTEM, buildExtractionPrompt, buildMatchingPrompt } from "./prompts";
export { createAIExtractionService } from "./extraction-service";
export { createAIMatchingService } from "./matching-service";
