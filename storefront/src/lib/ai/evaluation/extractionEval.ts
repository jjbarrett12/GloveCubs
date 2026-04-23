/**
 * AI Extraction Evaluator
 * 
 * Measures accuracy of product attribute extraction.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { generateExtractionReasoning } from '../reasoning';
import { normalizeProduct } from '../../legacy';
import type {
  ExtractionDatasetEntry,
  ExtractionEvalResult,
  EvaluationMetrics,
  ConfidenceBand,
} from './types';
import { getConfidenceBand, CONFIDENCE_BANDS } from './types';

// ============================================================================
// DATASET LOADING
// ============================================================================

/**
 * FIX: Track whether sample data is being used for production metrics
 */
let usingSampleData = false;

export function isUsingSampleData(): boolean {
  return usingSampleData;
}

export function loadExtractionDataset(datasetPath?: string): ExtractionDatasetEntry[] {
  const defaultPath = join(process.cwd(), '..', 'data', 'ai-evals', 'extraction_dataset.json');
  const path = datasetPath || defaultPath;
  
  if (!existsSync(path)) {
    // FIX: Log warning and track that we're using sample data
    console.warn(`[AI-EVAL] WARNING: Extraction dataset not found at ${path}, using sample data`);
    console.warn(`[AI-EVAL] Evaluation results with sample data should NOT be used for production metrics`);
    usingSampleData = true;
    return getSampleExtractionDataset();
  }
  
  usingSampleData = false;
  const raw = readFileSync(path, 'utf-8');
  const data = JSON.parse(raw) as ExtractionDatasetEntry[];
  
  // FIX: Validate dataset has sufficient entries for meaningful evaluation
  if (data.length < 10) {
    console.warn(`[AI-EVAL] WARNING: Extraction dataset has only ${data.length} entries (minimum 10 recommended)`);
  }
  
  return data;
}

// ============================================================================
// EVALUATION
// ============================================================================

export async function evaluateExtraction(
  dataset?: ExtractionDatasetEntry[]
): Promise<{
  results: ExtractionEvalResult[];
  metrics: EvaluationMetrics;
  by_field: Record<string, { correct: number; total: number; accuracy: number }>;
  by_confidence_band: Record<string, EvaluationMetrics>;
}> {
  const entries = dataset || loadExtractionDataset();
  const results: ExtractionEvalResult[] = [];
  
  // Field tracking
  const fieldStats: Record<string, { correct: number; total: number }> = {};
  const extractableFields = ['material', 'color', 'size', 'brand', 'grade', 
    'thickness_mil', 'units_per_box', 'powder_free', 'latex_free'];
  
  for (const field of extractableFields) {
    fieldStats[field] = { correct: 0, total: 0 };
  }
  
  // Confidence band tracking
  const bandResults: Record<string, ExtractionEvalResult[]> = {};
  for (const band of CONFIDENCE_BANDS) {
    bandResults[band.label] = [];
  }
  
  // Evaluate each entry
  for (const entry of entries) {
    const result = await evaluateSingleExtraction(entry);
    results.push(result);
    
    // Update field stats
    for (const [field, matched] of Object.entries(result.field_matches)) {
      if (fieldStats[field]) {
        fieldStats[field].total++;
        if (matched) fieldStats[field].correct++;
      }
    }
    
    // Track by confidence band
    const band = getConfidenceBand(result.predicted_confidence);
    bandResults[band].push(result);
  }
  
  // Calculate overall metrics
  const metrics = calculateMetrics(results);
  
  // Calculate per-field accuracy
  const by_field: Record<string, { correct: number; total: number; accuracy: number }> = {};
  for (const [field, stats] of Object.entries(fieldStats)) {
    by_field[field] = {
      ...stats,
      accuracy: stats.total > 0 ? stats.correct / stats.total : 0,
    };
  }
  
  // Calculate per-band metrics
  const by_confidence_band: Record<string, EvaluationMetrics> = {};
  for (const [band, bandEntries] of Object.entries(bandResults)) {
    if (bandEntries.length > 0) {
      by_confidence_band[band] = calculateMetrics(bandEntries);
    }
  }
  
  return { results, metrics, by_field, by_confidence_band };
}

async function evaluateSingleExtraction(
  entry: ExtractionDatasetEntry
): Promise<ExtractionEvalResult> {
  // Run extraction through legacy normalization
  const normalized = normalizeProduct({
    product_name_raw: entry.input.raw_title,
    description: entry.input.raw_description,
    ...entry.input.raw_specs,
  }, 'test_supplier');
  
  // Cast normalized product for flexible access
  const normalizedRecord = normalized as unknown as Record<string, unknown>;
  
  // Generate AI reasoning
  const aiReasoning = generateExtractionReasoning(
    {
      raw_title: entry.input.raw_title,
      raw_description: entry.input.raw_description,
      raw_specs: entry.input.raw_specs,
    },
    normalizedRecord,
    normalized.parse_confidence || 0.5
  );
  
  // Compare fields
  const field_matches: Record<string, boolean> = {};
  let matchCount = 0;
  let totalFields = 0;
  
  for (const [field, expectedValue] of Object.entries(entry.expected)) {
    if (expectedValue === undefined) continue;
    totalFields++;
    
    const predictedValue = normalizedRecord[field];
    const match = compareFieldValues(field, predictedValue, expectedValue);
    field_matches[field] = match;
    if (match) matchCount++;
  }
  
  const predicted_confidence = aiReasoning.overall_confidence;
  const expected_band = entry.expected_confidence_band;
  const actual_band = getConfidenceBand(predicted_confidence);
  
  return {
    entry_id: entry.id,
    predicted: normalizedRecord,
    expected: entry.expected,
    field_matches,
    overall_match: totalFields > 0 && matchCount === totalFields,
    predicted_confidence,
    expected_confidence_band: expected_band,
    confidence_in_band: actual_band === expected_band,
  };
}

function compareFieldValues(field: string, predicted: unknown, expected: unknown): boolean {
  if (predicted === undefined || predicted === null) return false;
  if (expected === undefined || expected === null) return true;
  
  // Normalize strings for comparison
  if (typeof predicted === 'string' && typeof expected === 'string') {
    return predicted.toLowerCase().trim() === expected.toLowerCase().trim();
  }
  
  // Numeric comparison with tolerance
  if (typeof predicted === 'number' && typeof expected === 'number') {
    if (field === 'thickness_mil') {
      return Math.abs(predicted - expected) <= 0.5;
    }
    return predicted === expected;
  }
  
  // Boolean comparison
  if (typeof predicted === 'boolean' && typeof expected === 'boolean') {
    return predicted === expected;
  }
  
  return String(predicted) === String(expected);
}

function calculateMetrics(results: ExtractionEvalResult[]): EvaluationMetrics {
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
  const correct = results.filter(r => r.overall_match).length;
  const incorrect = total - correct;
  
  // FIX: Calculate field-level precision and recall for more accurate metrics
  // Count total field predictions and correct field predictions
  let totalFieldPredictions = 0;
  let correctFieldPredictions = 0;
  let totalExpectedFields = 0;
  let foundExpectedFields = 0;
  
  for (const result of results) {
    for (const [field, matched] of Object.entries(result.field_matches)) {
      totalExpectedFields++;
      if (result.predicted[field] !== undefined && result.predicted[field] !== null) {
        totalFieldPredictions++;
        if (matched) {
          correctFieldPredictions++;
          foundExpectedFields++;
        }
      }
    }
  }
  
  // Precision: of fields we predicted, how many were correct
  const precision = totalFieldPredictions > 0 
    ? correctFieldPredictions / totalFieldPredictions 
    : 0;
  
  // Recall: of expected fields, how many did we correctly predict
  const recall = totalExpectedFields > 0 
    ? foundExpectedFields / totalExpectedFields 
    : 0;
  
  const accuracy = correct / total;
  const f1_score = precision + recall > 0 
    ? 2 * (precision * recall) / (precision + recall) 
    : 0;
  
  // FIX: Calculate false positive rate as fields predicted but wrong
  const falsePositives = totalFieldPredictions - correctFieldPredictions;
  const false_positive_rate = totalFieldPredictions > 0 
    ? falsePositives / totalFieldPredictions 
    : 0;
  
  // False negative rate: expected fields not predicted
  const falseNegatives = totalExpectedFields - foundExpectedFields;
  const false_negative_rate = totalExpectedFields > 0 
    ? falseNegatives / totalExpectedFields 
    : 0;
  
  const avg_confidence = results.reduce((sum, r) => sum + r.predicted_confidence, 0) / total;
  
  // Confidence calibration: how well does confidence predict correctness?
  const highConfCorrect = results.filter(r => r.predicted_confidence >= 0.8 && r.overall_match).length;
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

function getSampleExtractionDataset(): ExtractionDatasetEntry[] {
  return [
    {
      id: 'ext_001',
      input: {
        raw_title: 'AMMEX Professional Nitrile Exam Gloves, Black, Medium, 100/Box',
        raw_description: 'Powder-free, latex-free nitrile examination gloves',
      },
      expected: {
        material: 'nitrile',
        color: 'black',
        size: 'medium',
        brand: 'AMMEX',
        units_per_box: 100,
        powder_free: true,
        latex_free: true,
      },
      expected_confidence_band: 'high',
    },
    {
      id: 'ext_002',
      input: {
        raw_title: 'Vinyl Gloves Clear L 100ct',
      },
      expected: {
        material: 'vinyl',
        color: 'clear',
        size: 'large',
        units_per_box: 100,
      },
      expected_confidence_band: 'medium',
    },
    {
      id: 'ext_003',
      input: {
        raw_title: 'Blue Nitrile 4mil XL - Case of 10 boxes (1000 gloves)',
      },
      expected: {
        material: 'nitrile',
        color: 'blue',
        size: 'xl',
        thickness_mil: 4,
      },
      expected_confidence_band: 'medium',
    },
    {
      id: 'ext_004',
      input: {
        raw_title: 'Latex Exam Gloves PF Small 100/bx',
        raw_description: 'Medical grade latex examination gloves, powder free',
      },
      expected: {
        material: 'latex',
        size: 'small',
        units_per_box: 100,
        powder_free: true,
        grade: 'exam_grade',
      },
      expected_confidence_band: 'high',
    },
    {
      id: 'ext_005',
      input: {
        raw_title: 'Industrial Work Gloves Orange',
      },
      expected: {
        color: 'orange',
        grade: 'industrial',
      },
      expected_confidence_band: 'low',
    },
  ];
}

export { getSampleExtractionDataset };
