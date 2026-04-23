/**
 * AI Evaluation Types
 * 
 * Types for dataset-based evaluation of AI components.
 */

// ============================================================================
// COMMON TYPES
// ============================================================================

export interface EvaluationMetrics {
  total_samples: number;
  correct_predictions: number;
  incorrect_predictions: number;
  precision: number;
  recall: number;
  accuracy: number;
  false_positive_rate: number;
  false_negative_rate: number;
  f1_score: number;
  avg_confidence: number;
  confidence_calibration: number; // How well confidence predicts correctness
}

export interface ConfidenceBand {
  min: number;
  max: number;
  label: 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
}

export const CONFIDENCE_BANDS: ConfidenceBand[] = [
  { min: 0.0, max: 0.4, label: 'very_low' },
  { min: 0.4, max: 0.6, label: 'low' },
  { min: 0.6, max: 0.75, label: 'medium' },
  { min: 0.75, max: 0.9, label: 'high' },
  { min: 0.9, max: 1.01, label: 'very_high' }, // FIX: Use 1.01 to include confidence=1.0
];

export function getConfidenceBand(confidence: number): ConfidenceBand['label'] {
  // FIX: Handle edge case where confidence is exactly 1.0
  if (confidence >= 1.0) return 'very_high';
  const band = CONFIDENCE_BANDS.find(b => confidence >= b.min && confidence < b.max);
  return band?.label ?? 'medium';
}

// ============================================================================
// EXTRACTION EVALUATION
// ============================================================================

export interface ExtractionDatasetEntry {
  id: string;
  input: {
    raw_title: string;
    raw_description?: string;
    raw_specs?: Record<string, unknown>;
  };
  expected: {
    material?: string;
    color?: string;
    size?: string;
    brand?: string;
    grade?: string;
    thickness_mil?: number;
    units_per_box?: number;
    powder_free?: boolean;
    latex_free?: boolean;
  };
  expected_confidence_band: ConfidenceBand['label'];
}

export interface ExtractionEvalResult {
  entry_id: string;
  predicted: Record<string, unknown>;
  expected: Record<string, unknown>;
  field_matches: Record<string, boolean>;
  overall_match: boolean;
  predicted_confidence: number;
  expected_confidence_band: ConfidenceBand['label'];
  confidence_in_band: boolean;
}

// ============================================================================
// MATCHING EVALUATION
// ============================================================================

export interface MatchingDatasetEntry {
  id: string;
  input: {
    supplier_product: Record<string, unknown>;
    canonical_product: Record<string, unknown>;
  };
  expected: {
    match_result: 'exact_match' | 'likely_match' | 'variant' | 'new_product' | 'review';
    should_match: boolean;
    hard_constraints_pass: boolean;
  };
  expected_confidence_band: ConfidenceBand['label'];
}

export interface MatchingEvalResult {
  entry_id: string;
  predicted_result: string;
  expected_result: string;
  result_correct: boolean;
  predicted_confidence: number;
  expected_confidence_band: ConfidenceBand['label'];
  confidence_in_band: boolean;
  hard_constraints_correct: boolean;
}

// ============================================================================
// PRICING EVALUATION
// ============================================================================

export interface PricingDatasetEntry {
  id: string;
  input: {
    offer_price: number;
    market_avg_price: number;
    market_min_price: number;
    market_max_price: number;
    days_since_update: number;
    units_per_case?: number;
  };
  expected: {
    category: 'valid_best_price' | 'suspicious_outlier' | 'stale_offer' | 'unit_normalization_issue' | 'feed_error' | 'review_required';
    is_suspicious: boolean;
    is_stale: boolean;
    recommended_action: 'accept' | 'reject' | 'review' | 'flag_for_monitoring';
  };
  expected_confidence_band: ConfidenceBand['label'];
}

export interface PricingEvalResult {
  entry_id: string;
  predicted_category: string;
  expected_category: string;
  category_correct: boolean;
  action_correct: boolean;
  predicted_confidence: number;
  expected_confidence_band: ConfidenceBand['label'];
  confidence_in_band: boolean;
}

// ============================================================================
// SYNONYM EVALUATION
// ============================================================================

export interface SynonymDatasetEntry {
  id: string;
  input: {
    field_name: string;
    raw_term: string;
  };
  expected: {
    normalized_term: string;
    should_resolve: boolean;
  };
}

export interface SynonymEvalResult {
  entry_id: string;
  resolved_term: string | null;
  expected_term: string;
  correct: boolean;
  was_resolved: boolean;
  should_have_resolved: boolean;
}

// ============================================================================
// REPORT TYPES
// ============================================================================

export interface EvaluationReport {
  generated_at: string;
  extraction: {
    metrics: EvaluationMetrics;
    by_field: Record<string, { correct: number; total: number; accuracy: number }>;
    by_confidence_band: Record<string, EvaluationMetrics>;
  };
  matching: {
    metrics: EvaluationMetrics;
    by_result_type: Record<string, { correct: number; total: number; accuracy: number }>;
    hard_constraint_accuracy: number;
  };
  pricing: {
    metrics: EvaluationMetrics;
    by_category: Record<string, { correct: number; total: number; accuracy: number }>;
    anomaly_detection_rate: number;
  };
  synonyms: {
    resolution_rate: number;
    accuracy: number;
    missing_synonyms: string[];
  };
  overall_health: 'healthy' | 'degraded' | 'critical';
  recommendations: string[];
}
