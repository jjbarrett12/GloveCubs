/**
 * AI Evaluation Report Generator
 * 
 * Generates comprehensive evaluation reports for AI performance.
 */

import { evaluateExtraction } from './extractionEval';
import { evaluateMatching } from './matchingEval';
import { evaluatePricing } from './pricingEval';
import { evaluateSynonyms } from './synonymEval';
import type { EvaluationReport, EvaluationMetrics } from './types';

// ============================================================================
// REPORT GENERATION
// ============================================================================

export async function generateAiEvalReport(): Promise<EvaluationReport> {
  console.log('Starting AI evaluation...\n');
  
  // Run all evaluations
  console.log('1. Evaluating extraction...');
  const extractionResults = await evaluateExtraction();
  
  console.log('2. Evaluating matching...');
  const matchingResults = await evaluateMatching();
  
  console.log('3. Evaluating pricing...');
  const pricingResults = await evaluatePricing();
  
  console.log('4. Evaluating synonyms...');
  const synonymResults = await evaluateSynonyms();
  
  // Determine overall health
  const overall_health = determineOverallHealth(
    extractionResults.metrics,
    matchingResults.metrics,
    pricingResults.metrics,
    synonymResults.accuracy
  );
  
  // Generate recommendations
  const recommendations = generateRecommendations(
    extractionResults,
    matchingResults,
    pricingResults,
    synonymResults
  );
  
  const report: EvaluationReport = {
    generated_at: new Date().toISOString(),
    extraction: {
      metrics: extractionResults.metrics,
      by_field: extractionResults.by_field,
      by_confidence_band: extractionResults.by_confidence_band,
    },
    matching: {
      metrics: matchingResults.metrics,
      by_result_type: matchingResults.by_result_type,
      hard_constraint_accuracy: matchingResults.hard_constraint_accuracy,
    },
    pricing: {
      metrics: pricingResults.metrics,
      by_category: pricingResults.by_category,
      anomaly_detection_rate: pricingResults.anomaly_detection_rate,
    },
    synonyms: {
      resolution_rate: synonymResults.resolution_rate,
      accuracy: synonymResults.accuracy,
      missing_synonyms: synonymResults.missing_synonyms,
    },
    overall_health,
    recommendations,
  };
  
  console.log('\nEvaluation complete.');
  
  return report;
}

function determineOverallHealth(
  extraction: EvaluationMetrics,
  matching: EvaluationMetrics,
  pricing: EvaluationMetrics,
  synonymAccuracy: number
): 'healthy' | 'degraded' | 'critical' {
  // Calculate weighted average
  const weights = { extraction: 0.3, matching: 0.35, pricing: 0.25, synonyms: 0.1 };
  
  const weightedScore = 
    extraction.accuracy * weights.extraction +
    matching.accuracy * weights.matching +
    pricing.accuracy * weights.pricing +
    synonymAccuracy * weights.synonyms;
  
  // Check for critical failures
  if (matching.accuracy < 0.6 || extraction.accuracy < 0.5) {
    return 'critical';
  }
  
  if (weightedScore >= 0.8) {
    return 'healthy';
  } else if (weightedScore >= 0.6) {
    return 'degraded';
  } else {
    return 'critical';
  }
}

function generateRecommendations(
  extraction: { metrics: EvaluationMetrics; by_field: Record<string, { accuracy: number }> },
  matching: { metrics: EvaluationMetrics; hard_constraint_accuracy: number },
  pricing: { metrics: EvaluationMetrics; anomaly_detection_rate: number },
  synonyms: { accuracy: number; missing_synonyms: string[] }
): string[] {
  const recommendations: string[] = [];
  
  // Extraction recommendations
  if (extraction.metrics.accuracy < 0.7) {
    recommendations.push('Extraction accuracy is below threshold. Consider improving normalization rules.');
  }
  for (const [field, stats] of Object.entries(extraction.by_field)) {
    if (stats.accuracy < 0.6) {
      recommendations.push(`Field "${field}" has low extraction accuracy (${(stats.accuracy * 100).toFixed(0)}%). Add more extraction patterns.`);
    }
  }
  if (extraction.metrics.confidence_calibration < 0.7) {
    recommendations.push('Extraction confidence is poorly calibrated. Consider adjusting confidence scoring.');
  }
  
  // Matching recommendations
  if (matching.metrics.false_positive_rate > 0.15) {
    recommendations.push('Match false positive rate is high. Tighten matching criteria.');
  }
  if (matching.metrics.false_negative_rate > 0.2) {
    recommendations.push('Match false negative rate is high. Consider relaxing minor attribute requirements.');
  }
  if (matching.hard_constraint_accuracy < 0.95) {
    recommendations.push('Hard constraint checking is not reliable. Review constraint logic.');
  }
  
  // Pricing recommendations
  if (pricing.anomaly_detection_rate < 0.8) {
    recommendations.push('Anomaly detection rate is low. Review anomaly detection thresholds.');
  }
  if (pricing.metrics.false_positive_rate > 0.2) {
    recommendations.push('Too many false pricing anomalies. Consider raising thresholds.');
  }
  
  // Synonym recommendations
  if (synonyms.accuracy < 0.8) {
    recommendations.push('Synonym resolution accuracy is low. Verify synonym dictionary.');
  }
  if (synonyms.missing_synonyms.length > 0) {
    recommendations.push(`Missing ${synonyms.missing_synonyms.length} synonyms: ${synonyms.missing_synonyms.slice(0, 5).join(', ')}${synonyms.missing_synonyms.length > 5 ? '...' : ''}`);
  }
  
  if (recommendations.length === 0) {
    recommendations.push('All AI components are performing within acceptable thresholds.');
  }
  
  return recommendations;
}

// ============================================================================
// CONSOLE OUTPUT
// ============================================================================

export function printEvalReport(report: EvaluationReport): void {
  console.log('\n' + '='.repeat(60));
  console.log('AI EVALUATION REPORT');
  console.log('Generated: ' + report.generated_at);
  console.log('='.repeat(60) + '\n');
  
  // Extraction
  console.log('EXTRACTION');
  console.log('-'.repeat(40));
  printMetrics(report.extraction.metrics);
  console.log('\nBy Field:');
  for (const [field, stats] of Object.entries(report.extraction.by_field)) {
    if (stats.total > 0) {
      console.log(`  ${field}: ${(stats.accuracy * 100).toFixed(1)}% (${stats.correct}/${stats.total})`);
    }
  }
  
  // Matching
  console.log('\nMATCHING');
  console.log('-'.repeat(40));
  printMetrics(report.matching.metrics);
  console.log(`Hard Constraint Accuracy: ${(report.matching.hard_constraint_accuracy * 100).toFixed(1)}%`);
  console.log('\nBy Result Type:');
  for (const [type, stats] of Object.entries(report.matching.by_result_type)) {
    if (stats.total > 0) {
      console.log(`  ${type}: ${(stats.accuracy * 100).toFixed(1)}% (${stats.correct}/${stats.total})`);
    }
  }
  
  // Pricing
  console.log('\nPRICING');
  console.log('-'.repeat(40));
  printMetrics(report.pricing.metrics);
  console.log(`Anomaly Detection Rate: ${(report.pricing.anomaly_detection_rate * 100).toFixed(1)}%`);
  console.log('\nBy Category:');
  for (const [category, stats] of Object.entries(report.pricing.by_category)) {
    if (stats.total > 0) {
      console.log(`  ${category}: ${(stats.accuracy * 100).toFixed(1)}% (${stats.correct}/${stats.total})`);
    }
  }
  
  // Synonyms
  console.log('\nSYNONYMS');
  console.log('-'.repeat(40));
  console.log(`Resolution Rate: ${(report.synonyms.resolution_rate * 100).toFixed(1)}%`);
  console.log(`Accuracy: ${(report.synonyms.accuracy * 100).toFixed(1)}%`);
  if (report.synonyms.missing_synonyms.length > 0) {
    console.log(`Missing: ${report.synonyms.missing_synonyms.join(', ')}`);
  }
  
  // Overall
  console.log('\n' + '='.repeat(60));
  console.log(`OVERALL HEALTH: ${report.overall_health.toUpperCase()}`);
  console.log('='.repeat(60));
  
  // Recommendations
  if (report.recommendations.length > 0) {
    console.log('\nRECOMMENDATIONS:');
    for (const rec of report.recommendations) {
      console.log(`  • ${rec}`);
    }
  }
  
  console.log('');
}

function printMetrics(metrics: EvaluationMetrics): void {
  console.log(`  Samples: ${metrics.total_samples}`);
  console.log(`  Accuracy: ${(metrics.accuracy * 100).toFixed(1)}%`);
  console.log(`  Precision: ${(metrics.precision * 100).toFixed(1)}%`);
  console.log(`  Recall: ${(metrics.recall * 100).toFixed(1)}%`);
  console.log(`  F1 Score: ${(metrics.f1_score * 100).toFixed(1)}%`);
  console.log(`  Avg Confidence: ${(metrics.avg_confidence * 100).toFixed(1)}%`);
  console.log(`  Confidence Calibration: ${(metrics.confidence_calibration * 100).toFixed(1)}%`);
}
