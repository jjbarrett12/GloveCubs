/**
 * CatalogOS Phase 1 ingestion pipeline — public API.
 */

export { runPipeline, startAsyncIngest, runPipelineFromParsedRows } from "./run-pipeline";
export type { RunPipelineInput, RunPipelineFromParsedInput } from "./run-pipeline";
export type { PipelineResult, RowPipelineResult } from "./types";
export { fetchFeed } from "./fetch-feed";
export { parseFeed } from "./parsers";
export {
  createImportBatch,
  updateBatchCompletion,
  logBatchStep,
  patchImportBatchStats,
} from "./batch-service";
export { insertRawRows } from "./raw-service";
export { extractGloveAttributes } from "./attribute-extraction";
export { buildNormalizedFromRaw } from "./normalize-service";
export { matchToMaster, LOW_CONFIDENCE_THRESHOLD } from "./match-service";
export { computeSellPrice } from "./pricing-service";
export {
  computeImportAutoPricing,
  effectiveImportPricing,
  estimateImportShipping,
  listPriceMarkupOnLandedPercent,
  minPriceForGrossMargin,
} from "./import-pricing";
export type { ImportAutoPricingSnapshot, ImportPricingOverridePatch } from "./import-pricing";
export {
  loadImportPricingConfig,
  IMPORT_PRICING_RULE_VERSION,
  IMPORT_MIN_GROSS_MARGIN,
} from "./import-pricing-config";
export { flagAnomalies, countSkuInBatch, collectCaseQtysInBatch, collectCaseQtysFromParsed } from "./anomaly-service";
export { createSuggestedOffer } from "./offer-service";
export { runDeferredAiMatchingForBatch } from "./batch-ai-matching";
export type * from "./types";
