export {
  inferBaseSkuAndSizeFromSku,
  inferVariantFromSku,
  inferBaseSkuAndSize,
  inferSizeFromTitleOrSpecs,
  inferColorFromTitleOrSpecs,
  normalizeTitleStem,
  minPairwiseTitleJaccard,
  minPairwiseSkuStemCoherence,
  buildFamilyGroupKey,
  buildFamilyGroupKeyForAxis,
  onlySizeDiffers,
  onlyDiffersOnVariantAxis,
  computeFamilyInference,
  FAMILY_GROUPING_CONFIDENCE_THRESHOLD,
  FAMILY_GUARD_DEFAULTS,
} from "./family-inference";
export type {
  InferBaseSkuResult,
  SkuVariantParse,
  VariantAxis,
  StagingRowForInference,
  InferredFamilyRow,
  FamilyGroupMetaV1,
  FamilyGuardOptions,
} from "./family-inference";
export { runFamilyInferenceForBatch } from "./run-family-inference";
export type { RunFamilyInferenceResult } from "./run-family-inference";
export { createOpenAiVariantHint } from "./ai-variant-hint";
