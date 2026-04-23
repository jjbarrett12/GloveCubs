/**
 * AI Intelligence Layer - Main Exports
 * 
 * This module provides AI-assisted intelligence capabilities for GloveCubs:
 * 
 * 1. AI PRODUCT UNDERSTANDING
 *    - Synonym resolution for glove terminology
 *    - Extraction reasoning with confidence
 * 
 * 2. AI MATCH REASONING
 *    - Hard constraint enforcement (material, size, sterile, thickness, pack)
 *    - Detailed match evidence and conflict summaries
 *    - Review recommendations when confidence is low
 * 
 * 3. AI PRICING INTELLIGENCE
 *    - Anomaly detection (suspicious, stale, normalization issues)
 *    - Category classification (valid, outlier, feed_error)
 *    - Action recommendations
 * 
 * 4. AI SUPPLIER ANALYSIS
 *    - Relevance and category fit scoring
 *    - Duplicate detection
 *    - Ingestion recommendations
 * 
 * 5. AI OPS COPILOT
 *    - Pipeline run summaries
 *    - Risk highlighting
 *    - Actionable insights for operators
 * 
 * 6. LEARNING LOOP
 *    - Human feedback capture
 *    - Synonym learning from corrections
 *    - Feedback statistics
 * 
 * AI SAFETY RULES:
 * - AI may recommend, infer, summarize, and score
 * - AI may NOT silently override hard business constraints
 * - AI may NOT auto-merge records when critical attribute conflicts exist
 * - All AI outputs are auditable with reasoning and confidence
 * - Low-confidence AI outcomes route to review, not silent apply
 */

// Reasoning Services
export {
  // Synonym resolution
  loadSynonyms,
  resolveSynonym,
  
  // Extraction reasoning
  generateExtractionReasoning,
  persistExtractionResult,
  type AIExtractionInput,
  type AIExtractionOutput,
  
  // Match reasoning
  generateMatchReasoning,
  persistMatchReasoning,
  type AIMatchReasoningInput,
  type AIMatchReasoningOutput,
  
  // Pricing analysis
  generatePricingAnalysis,
  persistPricingAnalysis,
  type AIPricingAnalysisInput,
  type AIPricingAnalysisOutput,
  
  // Supplier analysis
  generateSupplierAnalysis,
  persistSupplierAnalysis,
  type AISupplierAnalysisInput,
  type AISupplierAnalysisOutput,
} from './reasoning';

// Ops Copilot
export {
  generateIngestionSummary,
  generatePriceGuardSummary,
  generateAuditSummary,
  generateDiscoverySummary,
  getLatestSummaries,
  getTodaySummary,
  type OpsSummary,
  type OpsSummaryHighlight,
} from './ops-copilot';

// Ops Copilot - Daily Intelligence
export {
  generateDailyOpsReport,
  type DailyOpsReport,
} from './ops-copilot';

// Feedback & Learning
export {
  captureExtractionFeedback,
  captureMatchFeedback,
  capturePricingFeedback,
  captureSupplierFeedback,
  captureReviewResolutionFeedback,
  verifySynonym,
  addSynonym,
  getFeedbackStats,
  generateLearningCandidates,
  applyLearningCandidate,
  captureStructuredCorrections,
  type FeedbackType,
  type CorrectionType,
  type FeedbackInput,
  type SynonymFeedback,
  type FeedbackStats,
  type LearningCandidate,
  type StructuredCorrection,
} from './feedback';

// Performance Metrics
export {
  recordAiMetric,
  recordAiMetrics,
  collectPipelineMetrics,
  getAggregatedMetrics,
  getMetricTrend,
  type MetricType,
  type MetricRecord,
  type AggregatedMetrics,
} from './metrics';

// LLM Escalation
export {
  resolveExtractionAmbiguity,
  resolveMatchAmbiguity,
  resolvePricingAnomaly,
  getLLMEscalationStatus,
  type LLMDecision,
} from './llmEscalation';

// Priority Scoring
export {
  calculateReviewPriority,
  updateReviewItemPriority,
  batchUpdateReviewPriorities,
  getHighPriorityReviews,
  getReviewsByPriorityBand,
  createPrioritizedReviewItem,
  type PriorityBand,
  type PriorityFactors,
  type PriorityResult,
  type CreatePrioritizedReviewInput,
} from './prioritization';

// Evaluation
export {
  generateAiEvalReport,
  evaluateExtraction,
  evaluateMatching,
  evaluatePricing,
  evaluateSynonyms,
  printEvalReport,
  type EvaluationReport,
  type EvaluationMetrics,
} from './evaluation';
