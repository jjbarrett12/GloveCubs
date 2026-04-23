/**
 * Supplier-ingestion normalization engine.
 * Uses approved attribute dictionary; rules first; unmapped values → review flags.
 */

export { str, strLower, num, arrStrings, firstStr, combinedText, extractContentFromRaw, parseThicknessFromRaw } from "./normalization-utils";
export { lookupAllowed, getUnmappedRaw } from "./synonym-lookup";
export {
  extractDisposableGloveAttributes,
  extractWorkGloveAttributes,
  type RawRow,
  type ExtractionOutcome,
} from "./extract-attributes-dictionary";
export { inferCategory, inferCategoryWithResult, CATEGORY_CONFIDENCE_THRESHOLD } from "./category-inference";
export type { CategoryInferenceResult } from "./category-inference";
export { runNormalization } from "./normalization-engine";
export { buildStagingPayload, validateNormalizedPayload } from "./staging-payload";
export type {
  NormalizationResult,
  ReviewFlag,
  ReviewFlagCode,
  NormalizationEngineOptions,
  CategoryInferenceDetail,
} from "./types";
export type { StagingPayload, StagingNormalizedData, BuildStagingPayloadInput } from "./staging-payload";
