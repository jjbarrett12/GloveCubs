/**
 * Recommendation Quality Metrics
 * 
 * Calculates true recommendation quality based on actual outcomes.
 * 
 * RULES:
 * - Metrics must use actual outcomes, not proxies
 * - Distinguish estimated vs realized savings
 * - Require minimum sample sizes for statistical validity
 */

import { supabaseAdmin } from '../jobs/supabase';

// ============================================================================
// TYPES
// ============================================================================

export type QualityMetricType = 
  | 'recommendation_acceptance_rate'
  | 'trusted_recommendation_acceptance_rate'
  | 'rejected_due_to_low_trust_rate'
  | 'realized_savings_capture_rate'
  | 'estimated_vs_realized_savings_error'
  | 'false_positive_recommendation_rate'
  | 'superseded_recommendation_rate'
  | 'recommendation_latency_to_decision'
  | 'top_rank_acceptance_rate'
  | 'override_rate'
  | 'rejection_reason_distribution';

export interface QualityMetric {
  metric_type: QualityMetricType;
  metric_value: number;
  sample_size: number;
  window_start: string;
  window_end: string;
  metadata?: Record<string, unknown>;
}

export interface QualityReport {
  window_start: string;
  window_end: string;
  metrics: QualityMetric[];
  summary: {
    overall_health: 'healthy' | 'attention' | 'critical';
    acceptance_rate: number;
    savings_capture_rate: number;
    total_realized_savings: number;
    sample_size: number;
  };
  recommendations: string[];
}

// ============================================================================
// MINIMUM SAMPLE SIZE FOR STATISTICAL VALIDITY
// ============================================================================

const MIN_SAMPLE_SIZE = 10;

// ============================================================================
// METRIC CALCULATION
// ============================================================================

export async function calculateQualityMetrics(
  window_days: number = 30
): Promise<QualityMetric[]> {
  const window_end = new Date().toISOString();
  const window_start = new Date(Date.now() - window_days * 24 * 60 * 60 * 1000).toISOString();
  
  const metrics: QualityMetric[] = [];
  
  // Fetch all outcomes in window
  const { data: outcomes } = await supabaseAdmin
    .from('recommendation_outcomes')
    .select('*')
    .gte('created_at', window_start)
    .lte('created_at', window_end);
    
  if (!outcomes || outcomes.length === 0) {
    return [];
  }
  
  // Calculate each metric
  metrics.push(await calculateAcceptanceRate(outcomes, window_start, window_end));
  metrics.push(await calculateTrustedAcceptanceRate(outcomes, window_start, window_end));
  metrics.push(await calculateLowTrustRejectionRate(outcomes, window_start, window_end));
  metrics.push(await calculateSavingsCaptureRate(outcomes, window_start, window_end));
  metrics.push(await calculateSavingsError(outcomes, window_start, window_end));
  metrics.push(await calculateFalsePositiveRate(outcomes, window_start, window_end));
  metrics.push(await calculateSupersededRate(outcomes, window_start, window_end));
  metrics.push(await calculateLatencyToDecision(outcomes, window_start, window_end));
  metrics.push(await calculateTopRankAcceptanceRate(outcomes, window_start, window_end));
  metrics.push(await calculateOverrideRate(outcomes, window_start, window_end));
  
  // Persist metrics
  for (const metric of metrics) {
    await persistQualityMetric(metric);
  }
  
  return metrics;
}

// ============================================================================
// INDIVIDUAL METRIC CALCULATIONS
// ============================================================================

interface OutcomeRow {
  outcome_status: string;
  recommended_trust_score: number | null;
  estimated_savings: number | null;
  realized_savings: number | null;
  recommended_rank: number | null;
  selected_supplier_id: string | null;
  supplier_id: string;
  created_at: string;
  accepted_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
}

async function calculateAcceptanceRate(
  outcomes: OutcomeRow[],
  window_start: string,
  window_end: string
): Promise<QualityMetric> {
  const decided = outcomes.filter(o => 
    o.outcome_status === 'accepted' || o.outcome_status === 'rejected'
  );
  const accepted = outcomes.filter(o => o.outcome_status === 'accepted');
  
  const statistically_valid = decided.length >= MIN_SAMPLE_SIZE;
  // Return -1 for insufficient data instead of 0 (which looks like bad rate)
  const rate = statistically_valid 
    ? accepted.length / decided.length 
    : -1;
    
  return {
    metric_type: 'recommendation_acceptance_rate',
    metric_value: rate,
    sample_size: decided.length,
    window_start,
    window_end,
    metadata: {
      accepted_count: accepted.length,
      decided_count: decided.length,
      statistically_valid,
      insufficient_data: !statistically_valid,
    },
  };
}

async function calculateTrustedAcceptanceRate(
  outcomes: OutcomeRow[],
  window_start: string,
  window_end: string
): Promise<QualityMetric> {
  // High trust = trust score >= 0.8
  const highTrust = outcomes.filter(o => 
    o.recommended_trust_score && o.recommended_trust_score >= 0.8
  );
  const highTrustDecided = highTrust.filter(o => 
    o.outcome_status === 'accepted' || o.outcome_status === 'rejected'
  );
  const highTrustAccepted = highTrust.filter(o => o.outcome_status === 'accepted');
  
  const statistically_valid = highTrustDecided.length >= MIN_SAMPLE_SIZE;
  const rate = statistically_valid 
    ? highTrustAccepted.length / highTrustDecided.length 
    : -1;
    
  return {
    metric_type: 'trusted_recommendation_acceptance_rate',
    metric_value: rate,
    sample_size: highTrustDecided.length,
    window_start,
    window_end,
    metadata: {
      high_trust_accepted: highTrustAccepted.length,
      high_trust_decided: highTrustDecided.length,
      trust_threshold: 0.8,
      statistically_valid,
      insufficient_data: !statistically_valid,
    },
  };
}

async function calculateLowTrustRejectionRate(
  outcomes: OutcomeRow[],
  window_start: string,
  window_end: string
): Promise<QualityMetric> {
  // Rejections where trust was cited as reason
  const rejected = outcomes.filter(o => o.outcome_status === 'rejected');
  const rejectedDueToTrust = rejected.filter(o => 
    o.rejection_reason?.toLowerCase().includes('trust') ||
    o.rejection_reason?.toLowerCase().includes('reliability') ||
    (o.recommended_trust_score && o.recommended_trust_score < 0.6)
  );
  
  const statistically_valid = rejected.length >= MIN_SAMPLE_SIZE;
  const rate = statistically_valid 
    ? rejectedDueToTrust.length / rejected.length 
    : -1;
    
  return {
    metric_type: 'rejected_due_to_low_trust_rate',
    metric_value: rate,
    sample_size: rejected.length,
    window_start,
    window_end,
    metadata: {
      rejected_due_to_trust: rejectedDueToTrust.length,
      total_rejected: rejected.length,
      statistically_valid,
      insufficient_data: !statistically_valid,
    },
  };
}

async function calculateSavingsCaptureRate(
  outcomes: OutcomeRow[],
  window_start: string,
  window_end: string
): Promise<QualityMetric> {
  const accepted = outcomes.filter(o => o.outcome_status === 'accepted');
  const withEstimated = accepted.filter(o => 
    o.estimated_savings && o.estimated_savings > 0
  );
  // Only count CONFIRMED realized savings (not estimated copies)
  const withRealized = accepted.filter(o => 
    o.realized_savings && o.realized_savings > 0
  );
  
  const totalEstimated = withEstimated.reduce(
    (sum, o) => sum + Number(o.estimated_savings || 0), 0
  );
  const totalRealized = withRealized.reduce(
    (sum, o) => sum + Number(o.realized_savings || 0), 0
  );
  
  const statistically_valid = withEstimated.length >= MIN_SAMPLE_SIZE;
  
  // Cap rate at 1.5 (150%) to flag anomalies, and -1 for insufficient data
  let rate: number;
  if (!statistically_valid) {
    rate = -1; // Insufficient data
  } else if (totalEstimated > 0) {
    rate = Math.min(totalRealized / totalEstimated, 1.5);
  } else {
    rate = 0;
  }
  
  // Flag if realized significantly exceeds estimated (indicates estimation problems)
  const overCapture = totalEstimated > 0 && totalRealized > totalEstimated * 1.1;
  
  return {
    metric_type: 'realized_savings_capture_rate',
    metric_value: rate,
    sample_size: withEstimated.length,
    window_start,
    window_end,
    metadata: {
      total_estimated: totalEstimated,
      total_realized: totalRealized,
      with_realized_count: withRealized.length,
      statistically_valid,
      over_capture_warning: overCapture,
      capture_percent: totalEstimated > 0 ? (totalRealized / totalEstimated * 100).toFixed(1) + '%' : 'N/A',
    },
  };
}

async function calculateSavingsError(
  outcomes: OutcomeRow[],
  window_start: string,
  window_end: string
): Promise<QualityMetric> {
  // Only use outcomes with both estimated and realized savings
  const withBoth = outcomes.filter(o => 
    o.estimated_savings != null && 
    o.realized_savings != null &&
    o.outcome_status === 'accepted'
  );
  
  if (withBoth.length < MIN_SAMPLE_SIZE) {
    return {
      metric_type: 'estimated_vs_realized_savings_error',
      metric_value: 0,
      sample_size: withBoth.length,
      window_start,
      window_end,
      metadata: { statistically_valid: false },
    };
  }
  
  // Calculate mean absolute percentage error
  let totalError = 0;
  for (const o of withBoth) {
    const estimated = Number(o.estimated_savings);
    const realized = Number(o.realized_savings);
    if (estimated > 0) {
      totalError += Math.abs((realized - estimated) / estimated);
    }
  }
  
  const mape = totalError / withBoth.length;
  
  return {
    metric_type: 'estimated_vs_realized_savings_error',
    metric_value: mape,
    sample_size: withBoth.length,
    window_start,
    window_end,
    metadata: {
      mean_absolute_percentage_error: mape,
      statistically_valid: true,
    },
  };
}

async function calculateFalsePositiveRate(
  outcomes: OutcomeRow[],
  window_start: string,
  window_end: string
): Promise<QualityMetric> {
  // False positive: recommended with high savings potential but rejected or no savings realized
  const highSavingsRecommended = outcomes.filter(o => 
    o.estimated_savings && o.estimated_savings > 0
  );
  const falsePositives = highSavingsRecommended.filter(o => 
    o.outcome_status === 'rejected' ||
    (o.outcome_status === 'accepted' && 
     o.realized_savings != null && 
     o.realized_savings <= 0)
  );
  
  const statistically_valid = highSavingsRecommended.length >= MIN_SAMPLE_SIZE;
  const rate = statistically_valid 
    ? falsePositives.length / highSavingsRecommended.length 
    : -1;
    
  return {
    metric_type: 'false_positive_recommendation_rate',
    metric_value: rate,
    sample_size: highSavingsRecommended.length,
    window_start,
    window_end,
    metadata: {
      false_positive_count: falsePositives.length,
      high_savings_recommended: highSavingsRecommended.length,
      statistically_valid,
      insufficient_data: !statistically_valid,
    },
  };
}

async function calculateSupersededRate(
  outcomes: OutcomeRow[],
  window_start: string,
  window_end: string
): Promise<QualityMetric> {
  const superseded = outcomes.filter(o => o.outcome_status === 'superseded');
  const statistically_valid = outcomes.length >= MIN_SAMPLE_SIZE;
  const rate = statistically_valid 
    ? superseded.length / outcomes.length 
    : -1;
    
  return {
    metric_type: 'superseded_recommendation_rate',
    metric_value: rate,
    sample_size: outcomes.length,
    window_start,
    window_end,
    metadata: {
      superseded_count: superseded.length,
      total_count: outcomes.length,
      statistically_valid,
      insufficient_data: !statistically_valid,
    },
  };
}

async function calculateLatencyToDecision(
  outcomes: OutcomeRow[],
  window_start: string,
  window_end: string
): Promise<QualityMetric> {
  const decided = outcomes.filter(o => 
    (o.outcome_status === 'accepted' && o.accepted_at) ||
    (o.outcome_status === 'rejected' && o.rejected_at)
  );
  
  if (decided.length < MIN_SAMPLE_SIZE) {
    return {
      metric_type: 'recommendation_latency_to_decision',
      metric_value: -1,
      sample_size: decided.length,
      window_start,
      window_end,
      metadata: { statistically_valid: false, insufficient_data: true },
    };
  }
  
  // Calculate all latencies for percentile analysis
  const latencies: number[] = [];
  for (const o of decided) {
    const created = new Date(o.created_at).getTime();
    const decided_at = o.accepted_at 
      ? new Date(o.accepted_at).getTime() 
      : new Date(o.rejected_at!).getTime();
    latencies.push((decided_at - created) / (1000 * 60 * 60));
  }
  
  // Sort for percentile calculation
  latencies.sort((a, b) => a - b);
  
  const avgHours = latencies.reduce((sum, h) => sum + h, 0) / latencies.length;
  const p50Index = Math.floor(latencies.length * 0.5);
  const p90Index = Math.floor(latencies.length * 0.9);
  const p99Index = Math.floor(latencies.length * 0.99);
  
  const p50 = latencies[p50Index] || 0;
  const p90 = latencies[p90Index] || 0;
  const p99 = latencies[p99Index] || latencies[latencies.length - 1] || 0;
  const min = latencies[0] || 0;
  const max = latencies[latencies.length - 1] || 0;
  
  return {
    metric_type: 'recommendation_latency_to_decision',
    metric_value: avgHours,
    sample_size: decided.length,
    window_start,
    window_end,
    metadata: {
      avg_hours_to_decision: avgHours,
      p50_hours: p50,
      p90_hours: p90,
      p99_hours: p99,
      min_hours: min,
      max_hours: max,
      statistically_valid: true,
    },
  };
}

async function calculateTopRankAcceptanceRate(
  outcomes: OutcomeRow[],
  window_start: string,
  window_end: string
): Promise<QualityMetric> {
  // How often is the #1 recommendation accepted?
  const topRanked = outcomes.filter(o => o.recommended_rank === 1);
  const topRankedDecided = topRanked.filter(o => 
    o.outcome_status === 'accepted' || o.outcome_status === 'rejected'
  );
  const topRankedAccepted = topRanked.filter(o => o.outcome_status === 'accepted');
  
  const statistically_valid = topRankedDecided.length >= MIN_SAMPLE_SIZE;
  const rate = statistically_valid 
    ? topRankedAccepted.length / topRankedDecided.length 
    : -1;
    
  return {
    metric_type: 'top_rank_acceptance_rate',
    metric_value: rate,
    sample_size: topRankedDecided.length,
    window_start,
    window_end,
    metadata: {
      top_rank_accepted: topRankedAccepted.length,
      top_rank_decided: topRankedDecided.length,
      statistically_valid,
      insufficient_data: !statistically_valid,
    },
  };
}

async function calculateOverrideRate(
  outcomes: OutcomeRow[],
  window_start: string,
  window_end: string
): Promise<QualityMetric> {
  // How often does the operator choose a different supplier?
  const accepted = outcomes.filter(o => o.outcome_status === 'accepted');
  const overridden = accepted.filter(o => 
    o.selected_supplier_id && o.selected_supplier_id !== o.supplier_id
  );
  
  const statistically_valid = accepted.length >= MIN_SAMPLE_SIZE;
  const rate = statistically_valid 
    ? overridden.length / accepted.length 
    : -1;
    
  return {
    metric_type: 'override_rate',
    metric_value: rate,
    sample_size: accepted.length,
    window_start,
    window_end,
    metadata: {
      overridden_count: overridden.length,
      accepted_count: accepted.length,
      statistically_valid,
      insufficient_data: !statistically_valid,
    },
  };
}

// ============================================================================
// PERSISTENCE
// ============================================================================

async function persistQualityMetric(metric: QualityMetric): Promise<void> {
  await supabaseAdmin
    .from('recommendation_quality_metrics')
    .insert({
      metric_type: metric.metric_type,
      metric_value: metric.metric_value,
      sample_size: metric.sample_size,
      window_start: metric.window_start,
      window_end: metric.window_end,
      metadata: metric.metadata,
    });
}

// ============================================================================
// QUALITY REPORT
// ============================================================================

export async function generateQualityReport(
  window_days: number = 30
): Promise<QualityReport> {
  const window_end = new Date().toISOString();
  const window_start = new Date(Date.now() - window_days * 24 * 60 * 60 * 1000).toISOString();
  
  // Calculate metrics
  const metrics = await calculateQualityMetrics(window_days);
  
  // Get summary stats
  const { data: summaryData } = await supabaseAdmin.rpc('get_outcome_summary', {
    p_window_days: window_days,
  });
  
  const summary_row = summaryData?.[0] || {};
  
  // Determine overall health
  const acceptance_rate = Number(summary_row.acceptance_rate) || 0;
  const savings_capture = Number(summary_row.savings_capture_rate) || 0;
  
  let overall_health: 'healthy' | 'attention' | 'critical' = 'healthy';
  if (acceptance_rate < 50 || savings_capture < 60) {
    overall_health = 'critical';
  } else if (acceptance_rate < 70 || savings_capture < 80) {
    overall_health = 'attention';
  }
  
  // Generate recommendations
  const recommendations: string[] = [];
  
  const acceptanceMetric = metrics.find(m => m.metric_type === 'recommendation_acceptance_rate');
  if (acceptanceMetric && acceptanceMetric.metric_value < 0.7 && acceptanceMetric.sample_size >= MIN_SAMPLE_SIZE) {
    recommendations.push('Acceptance rate below 70% - review recommendation criteria');
  }
  
  const overrideMetric = metrics.find(m => m.metric_type === 'override_rate');
  if (overrideMetric && overrideMetric.metric_value > 0.3 && overrideMetric.sample_size >= MIN_SAMPLE_SIZE) {
    recommendations.push('Override rate above 30% - operators are frequently choosing alternatives');
  }
  
  const falsePositiveMetric = metrics.find(m => m.metric_type === 'false_positive_recommendation_rate');
  if (falsePositiveMetric && falsePositiveMetric.metric_value > 0.2 && falsePositiveMetric.sample_size >= MIN_SAMPLE_SIZE) {
    recommendations.push('False positive rate above 20% - savings estimates may be too optimistic');
  }
  
  const lowTrustRejection = metrics.find(m => m.metric_type === 'rejected_due_to_low_trust_rate');
  if (lowTrustRejection && lowTrustRejection.metric_value > 0.4 && lowTrustRejection.sample_size >= MIN_SAMPLE_SIZE) {
    recommendations.push('Many rejections due to trust issues - trust scoring may need calibration');
  }
  
  return {
    window_start,
    window_end,
    metrics,
    summary: {
      overall_health,
      acceptance_rate,
      savings_capture_rate: savings_capture,
      total_realized_savings: Number(summary_row.total_realized_savings) || 0,
      sample_size: Number(summary_row.total_outcomes) || 0,
    },
    recommendations,
  };
}

// ============================================================================
// RETRIEVAL
// ============================================================================

export async function getQualityMetricTrend(
  metric_type: QualityMetricType,
  days: number = 90
): Promise<Array<{ date: string; value: number; sample_size: number }>> {
  const { data } = await supabaseAdmin
    .from('recommendation_quality_metrics')
    .select('metric_value, sample_size, window_end')
    .eq('metric_type', metric_type)
    .gte('window_end', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
    .order('window_end', { ascending: true });
    
  if (!data) return [];
  
  return data.map(d => ({
    date: new Date(d.window_end).toISOString().split('T')[0],
    value: Number(d.metric_value),
    sample_size: d.sample_size,
  }));
}
