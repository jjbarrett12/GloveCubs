/**
 * Legacy Module Adapters
 * 
 * TypeScript adapters for the existing JavaScript business logic modules.
 * These adapters provide typed interfaces while delegating to the actual
 * implementations in lib/*.js
 */

// Product Normalization
export {
  normalizeProduct,
  normalizeProducts,
  generateNormalizationReport,
  normalizeMaterial,
  normalizeColor,
  normalizeGrade,
  normalizeThickness,
  normalizeSize,
  generateCanonicalTitle,
  generateBulletPoints,
  generateKeywords,
  validateAndScore,
  type RawProductData,
  type NormalizedProduct,
  type NormalizationReport,
} from './productNormalization';

// Product Matching
export {
  findMatches,
  matchSingleProduct,
  matchProductBatch,
  generateMatchingReport,
  findDuplicatesInCatalog,
  matchProducts,
  determineMatchResult,
  compareField,
  stringSimilarity,
  THRESHOLDS as MATCH_THRESHOLDS,
  FIELD_WEIGHTS,
  type MatchResultType,
  type RecommendedAction,
  type ProductMatchResult,
  type ProductData,
  type BatchMatchResult,
  type MatchComparison,
} from './productMatching';

// Competitive Pricing
export {
  generateRecommendation,
  processPricingBatch,
  generatePricingReport,
  validateOffer,
  normalizeOffers,
  calculateMargin,
  meetsMarginFloor,
  calculateMinimumPrice,
  createPricingInput,
  DEFAULT_CONFIG as PRICING_CONFIG,
  TRUSTED_SOURCES,
  UNTRUSTED_SOURCES,
  type PricingAction,
  type PricingConfig,
  type CompetitorOffer as PricingCompetitorOffer,
  type PricingProduct,
  type PricingRecommendation,
  type BatchPricingResult,
} from './competitivePricing';

// Daily Price Guard
export {
  runDailyPriceGuard,
  generateDailyReport,
  calculatePriority,
  detectCostChange,
  detectCompetitorPriceChange,
  detectStaleness,
  isLongTailProduct,
  shouldCheckLongTail,
  GUARD_CONFIG,
  type GuardConfig,
  type GuardProduct,
  type ActionItem,
  type DailyGuardResult,
  type DailyGuardSummary,
} from './dailyPriceGuard';

// QA Supervisor
export {
  runFullAudit,
  auditSupplierDiscovery,
  auditProductIntake,
  auditProductMatching,
  auditCompetitivePricing,
  auditDailyPriceGuard,
  performSelfAudit,
  QA_CONFIG,
  type LegacyAuditData,
  type LegacyAuditResult,
  type LegacyAuditSummary,
  type LegacyModuleResult,
  type LegacyFix,
  type LegacyReviewItem,
  type LegacyBlockedAction,
  type LegacySystemicIssue,
  type LegacySelfAudit,
  type SupplierData,
  type ProductData as QAProductData,
  type MatchData,
  type PricingData,
  type CompetitorOfferData,
  type ActionData,
} from './qaSupervisor';
