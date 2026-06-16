/**

 * Product URL Extraction V2 — public exports.

 */



export { isUrlExtractionV2Enabled } from "./feature-flag";
export { runUrlExtractionV2 } from "./url-extraction-v2";
export type { RunUrlExtractionV2Input } from "./url-extraction-v2";
export {
  applyProductUrlExtractionV2Scoring,
  assessPackagingConflicts,
  scoreProductUrlExtractionV2,
} from "./score-extraction";
export type { PackagingConflictAssessment } from "./score-extraction";
export {
  buildProductSetupApplyCandidates,
  filterApplyCandidates,
  isSafeProductSetupApplyCandidate,
  isHighRiskComplianceField,
  isGlvLookingSku,
  PRODUCT_SETUP_APPLY_CANDIDATE_SCHEMA_VERSION,
} from "./product-setup-apply-candidates";
export type {
  ProductSetupApplyCandidateV1,
  ProductSetupApplyStatus,
  ProductSetupApplyMutationKind,
} from "./product-setup-apply-candidates";
export {
  buildProductSetupWizardReadiness,
  resolveWizardContractSummary,
  buildContractSummaryFromLegacyStaging,
  PRODUCT_SETUP_WIZARD_READINESS_SCHEMA_VERSION,
} from "./product-setup-wizard-readiness";
export type {
  ProductSetupWizardReadinessV1,
  ProductSetupWizardSection,
  ProductSetupWizardField,
  ProductSetupWizardOverallStatus,
  BuildProductSetupWizardReadinessInput,
} from "./product-setup-wizard-readiness";
export {
  buildProductSetupContractFromExtractionV2,
  buildProductSetupContractSummary,
  extractProductSetupPassthroughFromParsedRow,
  isProductSetupContractV1,
  isProductSetupContractSummaryV1,
  isGlvLookingSku,
  resolveProductSetupContractFull,
  PRODUCT_SETUP_CONTRACT_SCHEMA_VERSION,
} from "./product-setup-contract";
export type {
  BuildProductSetupContractContext,
  ProductSetupContractV1,
  ProductSetupContractSummaryV1,
} from "./product-setup-contract";
export {
  bridgeExtractionV2ToParsedRows,
  buildUrlImportProductPayloadsForExtractionV2,
  summarizeProductUrlExtractionV2,
} from "./extraction-v2-bridge";
export type {
  BridgeExtractionV2ToParsedRowsInput,
  BridgeExtractionV2ToParsedRowsResult,
  BuildUrlImportProductPayloadsInput,
} from "./extraction-v2-bridge";



export type {

  DisposableReusable,

  ExtractionSource,

  FieldEvidence,

  FieldTrust,

  ProductImageCandidate,

  ProductImageRole,

  ProductImageSource,

  ProductUrlExtractionV2,

  ProductUrlExtractionV2Summary,

  ProductUrlExtractionVersion,

  ProposedVariantFromUrl,

  VariantDimension,

  VariantDimensionName,

  VariantOption,

} from "./types";

