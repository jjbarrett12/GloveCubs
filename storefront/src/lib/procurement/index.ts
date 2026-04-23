/**
 * Procurement Intelligence Module
 * 
 * Provides trust scoring, money prioritization, and action recommendations
 * for the GloveCubs procurement platform.
 */

// Supplier Reliability
export {
  calculateSupplierReliabilityScore,
  calculateAllSupplierReliabilityScores,
  getSupplierReliability,
  getReliabilityLeaderboard,
  getRiskySuppliers,
  type ReliabilityBand,
  type SupplierReliabilityFactors,
  type SupplierReliabilityScore,
} from './supplierReliability';

// Offer Trust
export {
  calculateOfferTrustScore,
  calculateOfferTrustScoresForProduct,
  getOfferTrust,
  getLowTrustWinners,
  shouldOfferRequireReview,
  calculateTrustAdjustedPrice,
  type TrustBand,
  type OfferTrustFactors,
  type OfferTrustScore,
} from './offerTrust';

// Margin Opportunities
export {
  calculateMarginOpportunity,
  calculateMarginOpportunitiesForTopProducts,
  getTopMarginOpportunities,
  getOpportunitiesRequiringReview,
  type OpportunityBand,
  type MarginOpportunityFactors,
  type MarginOpportunity,
} from './marginOpportunity';

// Supplier Recommendations
export {
  rankSuppliersForProduct,
  getRecommendationsForProduct,
  getRecommendationsRequiringReview,
  type RecommendationBand,
  type SupplierRecommendationFactors,
  type SupplierRecommendation,
} from './supplierRecommendation';

// Procurement Alerts
export {
  generateProcurementAlerts,
  resolveProcurementAlert,
  acknowledgeProcurementAlert,
  dismissProcurementAlert,
  getActiveAlerts,
  getAlertsBySeverity,
  getAlertStats,
  type AlertType,
  type AlertSeverity,
  type AlertStatus,
  type ProcurementAlert,
} from './alerts';

// Metrics
export {
  collectProcurementMetrics,
  getMetricsSummary,
  getMetricTrend,
  type ProcurementMetricType,
  type ProcurementMetric,
  type MetricsSummary,
} from './metrics';

// Recommendation Outcomes
export {
  createPendingOutcome,
  recordRecommendationAcceptance,
  recordRecommendationRejection,
  recordRecommendationSuperseded,
  expireStaleRecommendations,
  updateRealizedSavings,
  getOutcome,
  getOutcomeByRecommendation,
  getPendingOutcomes,
  getAcceptedOutcomes,
  getRejectedOutcomes,
  getExpiringRecommendations,
  getOutcomeSummary,
  type OutcomeStatus,
  type DecisionSource,
  type SavingsConfidence,
  type RecommendationOutcome,
  type AcceptanceParams,
  type RejectionParams,
} from './outcomes';

// Quality Metrics
export {
  calculateQualityMetrics,
  generateQualityReport,
  getQualityMetricTrend,
  type QualityMetricType,
  type QualityMetric,
  type QualityReport,
} from './qualityMetrics';

// Scoring Feedback
export {
  detectFeedbackPatterns,
  generateScoringAdjustments,
  getEffectiveAdjustment,
  getSupplierAdjustments,
  getOfferAdjustments,
  runFeedbackCycle,
  cleanupExpiredAdjustments,
  type AdjustmentType,
  type ScoringAdjustment,
  type FeedbackPattern,
} from './scoringFeedback';

// Outcome Evaluation
export {
  runPureFunctionTests,
  runIntegrationTests,
  runFullEvaluation,
  type EvalResult,
  type EvalReport,
} from './evaluation/outcomeEval';

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

import { calculateAllSupplierReliabilityScores } from './supplierReliability';
import { calculateMarginOpportunitiesForTopProducts } from './marginOpportunity';
import { generateProcurementAlerts } from './alerts';
import { collectProcurementMetrics } from './metrics';
import { expireStaleRecommendations } from './outcomes';
import { calculateQualityMetrics } from './qualityMetrics';
import { runFeedbackCycle, cleanupExpiredAdjustments } from './scoringFeedback';

/**
 * Run full procurement intelligence cycle
 * Call during pipeline completion or nightly jobs
 */
export async function runProcurementIntelligenceCycle(): Promise<{
  suppliers_scored: number;
  opportunities_found: number;
  alerts_generated: number;
  metrics_collected: number;
  recommendations_expired: number;
  quality_metrics_calculated: number;
  feedback_patterns_detected: number;
  adjustments_created: number;
}> {
  // 1. Score all suppliers
  const supplierResults = await calculateAllSupplierReliabilityScores();
  
  // 2. Find margin opportunities
  const oppResults = await calculateMarginOpportunitiesForTopProducts(100);
  
  // 3. Generate alerts
  const alertResults = await generateProcurementAlerts();
  
  // 4. Collect procurement metrics
  const metrics = await collectProcurementMetrics();
  
  // 5. Expire stale recommendations
  const expiredResult = await expireStaleRecommendations(14);
  
  // 6. Calculate quality metrics from outcomes
  const qualityMetrics = await calculateQualityMetrics(30);
  
  // 7. Run feedback cycle to learn from outcomes
  const feedbackResult = await runFeedbackCycle(30);
  
  // 8. Clean up expired adjustments
  await cleanupExpiredAdjustments();
  
  return {
    suppliers_scored: supplierResults.calculated,
    opportunities_found: oppResults.opportunities_found,
    alerts_generated: alertResults.generated,
    metrics_collected: metrics.length,
    recommendations_expired: expiredResult.expired,
    quality_metrics_calculated: qualityMetrics.length,
    feedback_patterns_detected: feedbackResult.patterns_detected,
    adjustments_created: feedbackResult.adjustments_created,
  };
}
