/**
 * Product identity and resolution graph: public API.
 */

export {
  resolveRow,
} from "./resolution-engine";
export {
  runResolutionForBatch,
} from "./run-resolution-for-batch";
export type { RunResolutionForBatchResult } from "./run-resolution-for-batch";
export {
  getResolutionCandidatesForNormalizedRow,
  approveResolutionCandidate,
  rejectResolutionCandidate,
} from "./resolution-data";
export type { ResolutionCandidateRow } from "./resolution-data";
export { resolveAlias, resolveAliases, recordAliasUsage } from "./alias-service";
export { getMatchDecision, saveMatchDecision, buildDecisionKey } from "./match-decision-service";
export {
  getPatternsBySupplier,
  getPatternsByBrand,
  findMatchingPattern,
  upsertPattern,
  incrementPatternUsage,
} from "./sku-pattern-service";
export type { SkuPatternRow, ParsedSku } from "./sku-pattern-service";
export type {
  ResolutionMatchType,
  ResolutionCandidateStatus,
  ResolutionCandidate,
  NormalizedRowForResolution,
  ResolutionAutoAttachReason,
} from "./types";
export {
  RESOLUTION_AUTO_ATTACH_THRESHOLD,
  RESOLUTION_MIN_CONFIDENCE,
  RESOLUTION_AUTO_ATTACH_REASONS,
  RESOLUTION_REASONS,
} from "./types";
