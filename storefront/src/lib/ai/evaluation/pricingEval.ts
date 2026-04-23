/**
 * AI Pricing Evaluator
 * 
 * Measures accuracy of pricing anomaly detection.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { generatePricingAnalysis } from '../reasoning';
import type {
  PricingDatasetEntry,
  PricingEvalResult,
  EvaluationMetrics,
} from './types';
import { getConfidenceBand } from './types';

// ============================================================================
// DATASET LOADING
// ============================================================================

/**
 * FIX: Track whether sample data is being used for production metrics
 */
let usingSampleData = false;

export function isPricingEvalUsingSampleData(): boolean {
  return usingSampleData;
}

export function loadPricingDataset(datasetPath?: string): PricingDatasetEntry[] {
  const defaultPath = join(process.cwd(), '..', 'data', 'ai-evals', 'pricing_dataset.json');
  const path = datasetPath || defaultPath;
  
  if (!existsSync(path)) {
    // FIX: Log warning and track that we're using sample data
    console.warn(`[AI-EVAL] WARNING: Pricing dataset not found at ${path}, using sample data`);
    console.warn(`[AI-EVAL] Evaluation results with sample data should NOT be used for production metrics`);
    usingSampleData = true;
    return getSamplePricingDataset();
  }
  
  usingSampleData = false;
  const raw = readFileSync(path, 'utf-8');
  const data = JSON.parse(raw) as PricingDatasetEntry[];
  
  // FIX: Validate dataset has sufficient entries for meaningful evaluation
  if (data.length < 10) {
    console.warn(`[AI-EVAL] WARNING: Pricing dataset has only ${data.length} entries (minimum 10 recommended)`);
  }
  
  return data;
}

// ============================================================================
// EVALUATION
// ============================================================================

export async function evaluatePricing(
  dataset?: PricingDatasetEntry[]
): Promise<{
  results: PricingEvalResult[];
  metrics: EvaluationMetrics;
  by_category: Record<string, { correct: number; total: number; accuracy: number }>;
  anomaly_detection_rate: number;
}> {
  const entries = dataset || loadPricingDataset();
  const results: PricingEvalResult[] = [];
  
  // Category tracking
  const categoryStats: Record<string, { correct: number; total: number }> = {
    valid_best_price: { correct: 0, total: 0 },
    suspicious_outlier: { correct: 0, total: 0 },
    stale_offer: { correct: 0, total: 0 },
    unit_normalization_issue: { correct: 0, total: 0 },
    feed_error: { correct: 0, total: 0 },
    review_required: { correct: 0, total: 0 },
  };
  
  // Anomaly detection tracking
  let anomaliesExpected = 0;
  let anomaliesDetected = 0;
  
  for (const entry of entries) {
    const result = evaluateSinglePricing(entry);
    results.push(result);
    
    // Update category stats
    const expectedCategory = entry.expected.category;
    if (categoryStats[expectedCategory]) {
      categoryStats[expectedCategory].total++;
      if (result.category_correct) {
        categoryStats[expectedCategory].correct++;
      }
    }
    
    // Track anomaly detection
    if (entry.expected.is_suspicious) {
      anomaliesExpected++;
      // Check if we detected it as suspicious, stale, or review_required
      const detectedAsAnomaly = ['suspicious_outlier', 'stale_offer', 
        'unit_normalization_issue', 'feed_error', 'review_required']
        .includes(result.predicted_category);
      if (detectedAsAnomaly) {
        anomaliesDetected++;
      }
    }
  }
  
  // Calculate overall metrics
  const metrics = calculatePricingMetrics(results);
  
  // Calculate per-category accuracy
  const by_category: Record<string, { correct: number; total: number; accuracy: number }> = {};
  for (const [category, stats] of Object.entries(categoryStats)) {
    by_category[category] = {
      ...stats,
      accuracy: stats.total > 0 ? stats.correct / stats.total : 0,
    };
  }
  
  const anomaly_detection_rate = anomaliesExpected > 0 
    ? anomaliesDetected / anomaliesExpected 
    : 0;
  
  return { results, metrics, by_category, anomaly_detection_rate };
}

function evaluateSinglePricing(entry: PricingDatasetEntry): PricingEvalResult {
  // Generate pricing analysis
  const lastUpdated = new Date(Date.now() - entry.input.days_since_update * 24 * 60 * 60 * 1000);
  
  const analysis = generatePricingAnalysis({
    offer: {
      supplier_id: 'test_supplier',
      price: entry.input.offer_price,
      per_unit_price: entry.input.units_per_case 
        ? entry.input.offer_price / entry.input.units_per_case 
        : entry.input.offer_price,
      units_per_case: entry.input.units_per_case,
      last_updated: lastUpdated.toISOString(),
    },
    product: {
      id: 'test_product',
      title: 'Test Product',
    },
    market_context: {
      avg_price: entry.input.market_avg_price,
      min_price: entry.input.market_min_price,
      max_price: entry.input.market_max_price,
      competitor_count: 5,
    },
  });
  
  const predicted_category = analysis.analysis_category;
  const expected_category = entry.expected.category;
  
  const category_correct = predicted_category === expected_category;
  const action_correct = analysis.recommended_action === entry.expected.recommended_action;
  
  const predicted_confidence = analysis.confidence;
  const expected_band = entry.expected_confidence_band;
  const actual_band = getConfidenceBand(predicted_confidence);
  
  return {
    entry_id: entry.id,
    predicted_category,
    expected_category,
    category_correct,
    action_correct,
    predicted_confidence,
    expected_confidence_band: expected_band,
    confidence_in_band: actual_band === expected_band,
  };
}

function calculatePricingMetrics(results: PricingEvalResult[]): EvaluationMetrics {
  if (results.length === 0) {
    return {
      total_samples: 0,
      correct_predictions: 0,
      incorrect_predictions: 0,
      precision: 0,
      recall: 0,
      accuracy: 0,
      false_positive_rate: 0,
      false_negative_rate: 0,
      f1_score: 0,
      avg_confidence: 0,
      confidence_calibration: 0,
    };
  }
  
  const total = results.length;
  const correct = results.filter(r => r.category_correct).length;
  const incorrect = total - correct;
  
  // For anomaly detection precision/recall
  const anomalyCategories = ['suspicious_outlier', 'stale_offer', 
    'unit_normalization_issue', 'feed_error', 'review_required'];
  
  // Predictions that flagged anomalies
  const anomalyPredictions = results.filter(r => 
    anomalyCategories.includes(r.predicted_category)
  );
  const trueAnomalies = anomalyPredictions.filter(r => 
    anomalyCategories.includes(r.expected_category)
  ).length;
  
  const precision = anomalyPredictions.length > 0 
    ? trueAnomalies / anomalyPredictions.length 
    : 0;
  
  // Expected anomalies
  const expectedAnomalies = results.filter(r => 
    anomalyCategories.includes(r.expected_category)
  );
  const detectedAnomalies = expectedAnomalies.filter(r => 
    anomalyCategories.includes(r.predicted_category)
  ).length;
  
  const recall = expectedAnomalies.length > 0 
    ? detectedAnomalies / expectedAnomalies.length 
    : 0;
  
  const accuracy = correct / total;
  const f1_score = precision + recall > 0 
    ? 2 * (precision * recall) / (precision + recall) 
    : 0;
  
  // False positives: flagged as anomaly but wasn't
  const falsePositives = results.filter(r => 
    anomalyCategories.includes(r.predicted_category) &&
    r.expected_category === 'valid_best_price'
  ).length;
  const validPrices = results.filter(r => r.expected_category === 'valid_best_price').length;
  const false_positive_rate = validPrices > 0 ? falsePositives / validPrices : 0;
  
  // False negatives: didn't flag but should have
  const falseNegatives = results.filter(r => 
    r.predicted_category === 'valid_best_price' &&
    anomalyCategories.includes(r.expected_category)
  ).length;
  const false_negative_rate = expectedAnomalies.length > 0 
    ? falseNegatives / expectedAnomalies.length 
    : 0;
  
  const avg_confidence = results.reduce((sum, r) => sum + r.predicted_confidence, 0) / total;
  
  // Confidence calibration
  const highConfCorrect = results.filter(r => r.predicted_confidence >= 0.8 && r.category_correct).length;
  const highConfTotal = results.filter(r => r.predicted_confidence >= 0.8).length;
  const confidence_calibration = highConfTotal > 0 ? highConfCorrect / highConfTotal : 0;
  
  return {
    total_samples: total,
    correct_predictions: correct,
    incorrect_predictions: incorrect,
    precision,
    recall,
    accuracy,
    false_positive_rate,
    false_negative_rate,
    f1_score,
    avg_confidence,
    confidence_calibration,
  };
}

// ============================================================================
// SAMPLE DATASET
// ============================================================================

function getSamplePricingDataset(): PricingDatasetEntry[] {
  return [
    {
      id: 'price_001',
      input: {
        offer_price: 25.00,
        market_avg_price: 24.50,
        market_min_price: 22.00,
        market_max_price: 28.00,
        days_since_update: 2,
      },
      expected: {
        category: 'valid_best_price',
        is_suspicious: false,
        is_stale: false,
        recommended_action: 'accept',
      },
      expected_confidence_band: 'high',
    },
    {
      id: 'price_002',
      input: {
        offer_price: 8.00,
        market_avg_price: 25.00,
        market_min_price: 22.00,
        market_max_price: 28.00,
        days_since_update: 1,
        units_per_case: 100,
      },
      expected: {
        category: 'suspicious_outlier',
        is_suspicious: true,
        is_stale: false,
        recommended_action: 'flag_for_monitoring',
      },
      expected_confidence_band: 'high',
    },
    {
      id: 'price_003',
      input: {
        offer_price: 24.00,
        market_avg_price: 25.00,
        market_min_price: 22.00,
        market_max_price: 28.00,
        days_since_update: 45,
      },
      expected: {
        category: 'stale_offer',
        is_suspicious: false,
        is_stale: true,
        recommended_action: 'flag_for_monitoring',
      },
      expected_confidence_band: 'medium',
    },
    {
      id: 'price_004',
      input: {
        offer_price: 0,
        market_avg_price: 25.00,
        market_min_price: 22.00,
        market_max_price: 28.00,
        days_since_update: 1,
      },
      expected: {
        category: 'feed_error',
        is_suspicious: true,
        is_stale: false,
        recommended_action: 'reject',
      },
      expected_confidence_band: 'very_high',
    },
    {
      id: 'price_005',
      input: {
        offer_price: 5.00,
        market_avg_price: 25.00,
        market_min_price: 22.00,
        market_max_price: 28.00,
        days_since_update: 3,
        units_per_case: 100,
      },
      expected: {
        category: 'unit_normalization_issue',
        is_suspicious: true,
        is_stale: false,
        recommended_action: 'review',
      },
      expected_confidence_band: 'medium',
    },
    {
      id: 'price_006',
      input: {
        offer_price: 75.00,
        market_avg_price: 25.00,
        market_min_price: 22.00,
        market_max_price: 28.00,
        days_since_update: 5,
      },
      expected: {
        category: 'suspicious_outlier',
        is_suspicious: true,
        is_stale: false,
        recommended_action: 'flag_for_monitoring',
      },
      expected_confidence_band: 'high',
    },
  ];
}

export { getSamplePricingDataset };
