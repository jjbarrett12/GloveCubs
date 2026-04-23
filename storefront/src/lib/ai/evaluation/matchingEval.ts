/**
 * AI Matching Evaluator
 * 
 * Measures accuracy of product matching decisions.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { generateMatchReasoning } from '../reasoning';
import type {
  MatchingDatasetEntry,
  MatchingEvalResult,
  EvaluationMetrics,
} from './types';
import { getConfidenceBand, CONFIDENCE_BANDS } from './types';

// ============================================================================
// DATASET LOADING
// ============================================================================

/**
 * FIX: Track whether sample data is being used for production metrics
 */
let usingSampleData = false;

export function isMatchingEvalUsingSampleData(): boolean {
  return usingSampleData;
}

export function loadMatchingDataset(datasetPath?: string): MatchingDatasetEntry[] {
  const defaultPath = join(process.cwd(), '..', 'data', 'ai-evals', 'matching_dataset.json');
  const path = datasetPath || defaultPath;
  
  if (!existsSync(path)) {
    // FIX: Log warning and track that we're using sample data
    console.warn(`[AI-EVAL] WARNING: Matching dataset not found at ${path}, using sample data`);
    console.warn(`[AI-EVAL] Evaluation results with sample data should NOT be used for production metrics`);
    usingSampleData = true;
    return getSampleMatchingDataset();
  }
  
  usingSampleData = false;
  const raw = readFileSync(path, 'utf-8');
  const data = JSON.parse(raw) as MatchingDatasetEntry[];
  
  // FIX: Validate dataset has sufficient entries for meaningful evaluation
  if (data.length < 10) {
    console.warn(`[AI-EVAL] WARNING: Matching dataset has only ${data.length} entries (minimum 10 recommended)`);
  }
  
  return data;
}

// ============================================================================
// EVALUATION
// ============================================================================

export async function evaluateMatching(
  dataset?: MatchingDatasetEntry[]
): Promise<{
  results: MatchingEvalResult[];
  metrics: EvaluationMetrics;
  by_result_type: Record<string, { correct: number; total: number; accuracy: number }>;
  hard_constraint_accuracy: number;
}> {
  const entries = dataset || loadMatchingDataset();
  const results: MatchingEvalResult[] = [];
  
  // Result type tracking
  const resultTypeStats: Record<string, { correct: number; total: number }> = {
    exact_match: { correct: 0, total: 0 },
    likely_match: { correct: 0, total: 0 },
    variant: { correct: 0, total: 0 },
    new_product: { correct: 0, total: 0 },
    review: { correct: 0, total: 0 },
  };
  
  // Hard constraint tracking
  let hardConstraintCorrect = 0;
  let hardConstraintTotal = 0;
  
  for (const entry of entries) {
    const result = evaluateSingleMatch(entry);
    results.push(result);
    
    // Update result type stats
    const expectedType = entry.expected.match_result;
    if (resultTypeStats[expectedType]) {
      resultTypeStats[expectedType].total++;
      if (result.result_correct) {
        resultTypeStats[expectedType].correct++;
      }
    }
    
    // Track hard constraint accuracy
    hardConstraintTotal++;
    if (result.hard_constraints_correct) {
      hardConstraintCorrect++;
    }
  }
  
  // Calculate overall metrics
  const metrics = calculateMatchingMetrics(results);
  
  // Calculate per-type accuracy
  const by_result_type: Record<string, { correct: number; total: number; accuracy: number }> = {};
  for (const [type, stats] of Object.entries(resultTypeStats)) {
    by_result_type[type] = {
      ...stats,
      accuracy: stats.total > 0 ? stats.correct / stats.total : 0,
    };
  }
  
  const hard_constraint_accuracy = hardConstraintTotal > 0 
    ? hardConstraintCorrect / hardConstraintTotal 
    : 0;
  
  return { results, metrics, by_result_type, hard_constraint_accuracy };
}

function evaluateSingleMatch(entry: MatchingDatasetEntry): MatchingEvalResult {
  // Generate AI match reasoning
  const reasoning = generateMatchReasoning({
    supplier_product: {
      id: 'test_supplier_product',
      ...entry.input.supplier_product,
    },
    canonical_product: {
      id: 'test_canonical_product',
      ...entry.input.canonical_product,
    },
    rules_confidence: 0.75, // Default starting confidence
    rules_recommendation: 'likely_match', // Default
  });
  
  const predicted_result = reasoning.match_recommendation;
  const expected_result = entry.expected.match_result;
  
  // Check if result matches expected
  const result_correct = predicted_result === expected_result;
  
  // Check hard constraints
  const hard_constraints_correct = reasoning.hard_constraints_passed === entry.expected.hard_constraints_pass;
  
  const predicted_confidence = reasoning.confidence;
  const expected_band = entry.expected_confidence_band;
  const actual_band = getConfidenceBand(predicted_confidence);
  
  return {
    entry_id: entry.id,
    predicted_result,
    expected_result,
    result_correct,
    predicted_confidence,
    expected_confidence_band: expected_band,
    confidence_in_band: actual_band === expected_band,
    hard_constraints_correct,
  };
}

function calculateMatchingMetrics(results: MatchingEvalResult[]): EvaluationMetrics {
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
  const correct = results.filter(r => r.result_correct).length;
  const incorrect = total - correct;
  
  // For matching, consider "match" predictions (exact_match, likely_match)
  const matchPredictions = results.filter(r => 
    ['exact_match', 'likely_match'].includes(r.predicted_result)
  );
  const correctMatches = matchPredictions.filter(r => r.result_correct).length;
  
  // Precision: of predicted matches, how many were correct
  const precision = matchPredictions.length > 0 
    ? correctMatches / matchPredictions.length 
    : 0;
  
  // Recall: of expected matches, how many did we find
  const expectedMatches = results.filter(r => 
    ['exact_match', 'likely_match'].includes(r.expected_result)
  );
  const foundMatches = expectedMatches.filter(r => 
    ['exact_match', 'likely_match'].includes(r.predicted_result)
  ).length;
  const recall = expectedMatches.length > 0 
    ? foundMatches / expectedMatches.length 
    : 0;
  
  const accuracy = correct / total;
  const f1_score = precision + recall > 0 
    ? 2 * (precision * recall) / (precision + recall) 
    : 0;
  
  // False positive: predicted match when it shouldn't
  const falsePositives = results.filter(r => 
    ['exact_match', 'likely_match'].includes(r.predicted_result) &&
    !['exact_match', 'likely_match'].includes(r.expected_result)
  ).length;
  const false_positive_rate = total > 0 ? falsePositives / total : 0;
  
  // False negative: didn't predict match when it should
  const falseNegatives = results.filter(r => 
    !['exact_match', 'likely_match'].includes(r.predicted_result) &&
    ['exact_match', 'likely_match'].includes(r.expected_result)
  ).length;
  const false_negative_rate = expectedMatches.length > 0 
    ? falseNegatives / expectedMatches.length 
    : 0;
  
  const avg_confidence = results.reduce((sum, r) => sum + r.predicted_confidence, 0) / total;
  
  // Confidence calibration
  const highConfCorrect = results.filter(r => r.predicted_confidence >= 0.8 && r.result_correct).length;
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

function getSampleMatchingDataset(): MatchingDatasetEntry[] {
  return [
    {
      id: 'match_001',
      input: {
        supplier_product: {
          title: 'AMMEX Professional Nitrile Exam Gloves Black Medium 100/Box',
          brand: 'AMMEX',
          material: 'nitrile',
          color: 'black',
          size: 'medium',
          units_per_box: 100,
          mpn: 'ABNPF44100',
        },
        canonical_product: {
          title: 'AMMEX Professional Nitrile Exam Gloves Black Medium 100/Box',
          brand: 'AMMEX',
          material: 'nitrile',
          color: 'black',
          size: 'medium',
          units_per_box: 100,
          mpn: 'ABNPF44100',
        },
      },
      expected: {
        match_result: 'exact_match',
        should_match: true,
        hard_constraints_pass: true,
      },
      expected_confidence_band: 'very_high',
    },
    {
      id: 'match_002',
      input: {
        supplier_product: {
          brand: 'AMMEX',
          material: 'nitrile',
          color: 'black',
          size: 'medium',
          units_per_box: 100,
        },
        canonical_product: {
          brand: 'AMMEX',
          material: 'latex', // Different material - hard constraint
          color: 'black',
          size: 'medium',
          units_per_box: 100,
        },
      },
      expected: {
        match_result: 'new_product',
        should_match: false,
        hard_constraints_pass: false,
      },
      expected_confidence_band: 'high',
    },
    {
      id: 'match_003',
      input: {
        supplier_product: {
          brand: 'Ansell',
          material: 'nitrile',
          color: 'blue',
          size: 'large',
          units_per_box: 100,
        },
        canonical_product: {
          brand: 'Ansell',
          material: 'nitrile',
          color: 'blue',
          size: 'small', // Different size - hard constraint
          units_per_box: 100,
        },
      },
      expected: {
        match_result: 'new_product',
        should_match: false,
        hard_constraints_pass: false,
      },
      expected_confidence_band: 'high',
    },
    {
      id: 'match_004',
      input: {
        supplier_product: {
          brand: 'Generic',
          material: 'vinyl',
          color: 'clear',
          size: 'medium',
          units_per_box: 100,
        },
        canonical_product: {
          brand: 'No-Name',
          material: 'vinyl',
          color: 'clear',
          size: 'medium',
          units_per_box: 100,
        },
      },
      expected: {
        match_result: 'likely_match',
        should_match: true,
        hard_constraints_pass: true,
      },
      expected_confidence_band: 'medium',
    },
    {
      id: 'match_005',
      input: {
        supplier_product: {
          brand: 'AMMEX',
          material: 'nitrile',
          size: 'large',
          units_per_box: 200,
        },
        canonical_product: {
          brand: 'AMMEX',
          material: 'nitrile',
          size: 'large',
          units_per_box: 100, // Different pack size - hard constraint
        },
      },
      expected: {
        match_result: 'variant',
        should_match: false,
        hard_constraints_pass: false,
      },
      expected_confidence_band: 'medium',
    },
  ];
}

export { getSampleMatchingDataset };
