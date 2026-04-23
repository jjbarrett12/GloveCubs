/**
 * CatalogOS data layer — exact schema: catalogos.*
 */

export {
  listSuppliers,
  getSupplierById,
  createSupplier,
  type SupplierRow,
  type CreateSupplierInput,
} from "./suppliers";

export {
  listFeeds,
  listFeedsBySupplier,
  getFeedById,
  getFeedUrl,
  createFeed,
  type FeedType,
  type SupplierFeedRow,
  type CreateFeedInput,
} from "./feeds";

export * from "./filter-attributes";
export type { NormalizedProduct, NormalizedProductCore, FilterAttributes, NormalizedStagingRow, ReviewFlag } from "./normalized-product-types";
export type { RawRow, ExtractionResult } from "./extraction-types";
export {
  normalizedProductSchema,
  normalizedProductCoreSchema,
  filterAttributesSchema,
  reviewFlagSchema,
} from "./normalized-product-schema";
export type { NormalizedProductParsed, FilterAttributesParsed } from "./normalized-product-schema";
export {
  extractDisposableGloveFilters,
  extractWorkGloveFilters,
  extractMaterial,
  extractSize,
  extractColor,
  extractThicknessMil,
  extractPowder,
  extractGrade,
  extractIndustries,
  extractCompliance,
  extractTexture,
  extractCuffStyle,
  extractPackaging,
  extractSterility,
  extractCutLevelAnsi,
  extractPunctureLevel,
  extractAbrasionLevel,
  extractWarmColdWeather,
} from "./extract-filters";
export { ensureAllowedValue, ensureExtractedValuesInAllowed } from "./ensure-allowed-value";
export { createReviewFlag, evaluateReviewFlags } from "./review-flags";
export type { ReviewFlagType, ReviewFlagInput } from "./review-flags";
export { runAIExtractionFallback } from "./ai-extraction-fallback";
export type { AIExtractionFallbackInput, AIExtractionFallbackOutput } from "./ai-extraction-fallback";

export * from "./attribute-dictionary-types";
export {
  normalizedProductContentSchema,
  normalizedDisposableGloveAttributesSchema,
  normalizedWorkGloveAttributesSchema,
  normalizedSupplierProductPayloadSchema,
} from "./attribute-dictionary-schema";
export type {
  NormalizedProductContentParsed,
  NormalizedDisposableGloveAttributesParsed,
  NormalizedWorkGloveAttributesParsed,
  NormalizedSupplierProductPayloadParsed,
} from "./attribute-dictionary-schema";
export { normalizeAttributeValue, normalizeToAllowed } from "./synonym-normalize";
export {
  createSynonymProvider,
  getDefaultSynonymProvider,
  getFallbackSynonymMap,
  resetDefaultSynonymProvider,
} from "./synonym-provider";
export type { SynonymMap, SynonymProvider, SynonymProviderOptions } from "./synonym-provider";
export {
  validateAttributesByCategory,
  isMultiSelectAttribute,
  DISPOSABLE_REQUIRED,
  DISPOSABLE_STRONGLY_PREFERRED,
  WORK_GLOVE_REQUIRED,
  WORK_GLOVE_STRONGLY_PREFERRED,
  MULTI_SELECT_ATTRIBUTE_KEYS,
} from "./attribute-validation";
export type { ValidationResult, RequirementLevel, AttributeRequirement } from "./attribute-validation";
export { parseSafe, stageSafe, publishSafe } from "./validation-modes";
export type { ParseSafeInput, ParseSafeResult, StageSafeResult, PublishSafeResult } from "./validation-modes";
