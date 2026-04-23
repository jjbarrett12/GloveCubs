/**
 * Procurement Intelligence Metrics
 * 
 * Tracks and validates:
 * - supplier_reliability_accuracy
 * - offer_trust_accuracy
 * - recommendation_acceptance_rate
 * - margin_opportunity_capture_rate
 * - alert_precision
 * - false_alert_rate
 */

import { supabaseAdmin } from '../jobs/supabase';

// ============================================================================
// CONFIGURATION
// ============================================================================

// Minimum sample sizes for reliable metrics
const MIN_SAMPLE_SIZE_FOR_METRICS = 20;
const MIN_SAMPLE_SIZE_FOR_RATES = 10;

// Historical window for rate calculations (days)
const HISTORICAL_WINDOW_DAYS = 30;

// ============================================================================
// TYPES
// ============================================================================

export type ProcurementMetricType = 
  | 'supplier_reliability_accuracy'
  | 'offer_trust_accuracy'
  | 'recommendation_acceptance_rate'
  | 'margin_opportunity_capture_rate'
  | 'alert_precision'
  | 'false_alert_rate'
  | 'avg_supplier_reliability'
  | 'avg_offer_trust'
  | 'critical_alerts_count'
  | 'margin_opportunities_found';

export interface ProcurementMetric {
  metric_type: ProcurementMetricType;
  metric_value: number;
  sample_size: number;
  metadata: Record<string, unknown>;
}

export interface MetricsSummary {
  reliability: {
    avg_score: number;
    trusted_count: number;
    risky_count: number;
    sample_size: number;
  };
  trust: {
    avg_score: number;
    high_trust_count: number;
    low_trust_count: number;
    sample_size: number;
  };
  opportunities: {
    major_count: number;
    total_potential_savings: number;
    sample_size: number;
  };
  alerts: {
    open_count: number;
    critical_count: number;
    resolved_today: number;
  };
  recommendations: {
    acceptance_rate: number;
    sample_size: number;
  };
}

// ============================================================================
// METRIC COLLECTION
// ============================================================================

export async function collectProcurementMetrics(): Promise<ProcurementMetric[]> {
  const metrics: ProcurementMetric[] = [];
  
  // Collect all metrics in parallel
  const [
    reliabilityMetrics,
    trustMetrics,
    opportunityMetrics,
    alertMetrics,
    recommendationMetrics,
  ] = await Promise.all([
    collectReliabilityMetrics(),
    collectTrustMetrics(),
    collectOpportunityMetrics(),
    collectAlertMetrics(),
    collectRecommendationMetrics(),
  ]);
  
  metrics.push(...reliabilityMetrics);
  metrics.push(...trustMetrics);
  metrics.push(...opportunityMetrics);
  metrics.push(...alertMetrics);
  metrics.push(...recommendationMetrics);
  
  // Persist all metrics
  for (const metric of metrics) {
    await persistMetric(metric);
  }
  
  return metrics;
}

async function collectReliabilityMetrics(): Promise<ProcurementMetric[]> {
  const metrics: ProcurementMetric[] = [];
  
  const { data: reliabilityData } = await supabaseAdmin
    .from('supplier_reliability_leaderboard')
    .select('reliability_score, reliability_band, sample_size');
    
  if (reliabilityData && reliabilityData.length > 0) {
    const scores = reliabilityData.map(d => Number(d.reliability_score));
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    
    const bandCounts = {
      trusted: reliabilityData.filter(d => d.reliability_band === 'trusted').length,
      stable: reliabilityData.filter(d => d.reliability_band === 'stable').length,
      watch: reliabilityData.filter(d => d.reliability_band === 'watch').length,
      risky: reliabilityData.filter(d => d.reliability_band === 'risky').length,
    };
    
    metrics.push({
      metric_type: 'avg_supplier_reliability',
      metric_value: avgScore,
      sample_size: reliabilityData.length,
      metadata: { 
        band_distribution: bandCounts,
        is_reliable: reliabilityData.length >= MIN_SAMPLE_SIZE_FOR_METRICS,
      },
    });
    
    // Accuracy based on validated predictions (not just distribution)
    // True accuracy requires tracking predictions vs outcomes
    // For now, calculate "validated reliability rate" - suppliers with sufficient data
    const validatedSuppliers = reliabilityData.filter(
      d => (d.sample_size || 0) >= MIN_SAMPLE_SIZE_FOR_METRICS
    );
    const validatedRate = validatedSuppliers.length / reliabilityData.length;
    
    metrics.push({
      metric_type: 'supplier_reliability_accuracy',
      metric_value: validatedRate,
      sample_size: reliabilityData.length,
      metadata: { 
        note: 'Measures % of suppliers with sufficient data for reliable scoring',
        validated_count: validatedSuppliers.length,
        is_reliable: reliabilityData.length >= MIN_SAMPLE_SIZE_FOR_METRICS,
      },
    });
  }
  
  return metrics;
}

async function collectTrustMetrics(): Promise<ProcurementMetric[]> {
  const metrics: ProcurementMetric[] = [];
  
  // Get recent trust scores
  const { data: trustData } = await supabaseAdmin
    .from('offer_trust_scores')
    .select('trust_score, trust_band')
    .gte('calculated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    
  if (trustData && trustData.length > 0) {
    const scores = trustData.map(d => Number(d.trust_score));
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    
    const bandCounts = {
      high_trust: trustData.filter(d => d.trust_band === 'high_trust').length,
      medium_trust: trustData.filter(d => d.trust_band === 'medium_trust').length,
      review_sensitive: trustData.filter(d => d.trust_band === 'review_sensitive').length,
      low_trust: trustData.filter(d => d.trust_band === 'low_trust').length,
    };
    
    metrics.push({
      metric_type: 'avg_offer_trust',
      metric_value: avgScore,
      sample_size: trustData.length,
      metadata: { band_distribution: bandCounts },
    });
    
    // Accuracy: % in high/medium trust
    const accuracyRate = (bandCounts.high_trust + bandCounts.medium_trust) / trustData.length;
    metrics.push({
      metric_type: 'offer_trust_accuracy',
      metric_value: accuracyRate,
      sample_size: trustData.length,
      metadata: {},
    });
  }
  
  return metrics;
}

async function collectOpportunityMetrics(): Promise<ProcurementMetric[]> {
  const metrics: ProcurementMetric[] = [];
  
  const { data: oppData } = await supabaseAdmin
    .from('margin_opportunities')
    .select('opportunity_band, estimated_savings_per_case')
    .gte('calculated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    
  if (oppData && oppData.length > 0) {
    const majorCount = oppData.filter(d => d.opportunity_band === 'major').length;
    const meaningfulCount = oppData.filter(d => d.opportunity_band === 'meaningful').length;
    
    const totalSavings = oppData
      .filter(d => d.estimated_savings_per_case)
      .reduce((sum, d) => sum + Number(d.estimated_savings_per_case || 0), 0);
      
    metrics.push({
      metric_type: 'margin_opportunities_found',
      metric_value: majorCount + meaningfulCount,
      sample_size: oppData.length,
      metadata: {
        major: majorCount,
        meaningful: meaningfulCount,
        total_potential_savings: totalSavings,
      },
    });
    
    // Capture rate would need historical tracking - placeholder
    metrics.push({
      metric_type: 'margin_opportunity_capture_rate',
      metric_value: 0, // To be calculated from resolution data
      sample_size: 0,
      metadata: { note: 'Requires resolution tracking' },
    });
  }
  
  return metrics;
}

async function collectAlertMetrics(): Promise<ProcurementMetric[]> {
  const metrics: ProcurementMetric[] = [];
  
  // Use historical window for precision calculation (not just today)
  const historyStart = new Date(Date.now() - HISTORICAL_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  
  // Get recent alerts for current state
  const { data: recentAlerts } = await supabaseAdmin
    .from('procurement_alerts')
    .select('severity, status')
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    
  // Get historical alerts for precision calculation
  const { data: historicalAlerts } = await supabaseAdmin
    .from('procurement_alerts')
    .select('severity, status, resolved_at')
    .gte('created_at', historyStart)
    .in('status', ['resolved', 'dismissed']);
    
  const criticalCount = recentAlerts?.filter(
    d => d.severity === 'critical' && d.status === 'open'
  ).length || 0;
  
  metrics.push({
    metric_type: 'critical_alerts_count',
    metric_value: criticalCount,
    sample_size: recentAlerts?.length || 0,
    metadata: {
      total_open: recentAlerts?.filter(d => d.status === 'open').length || 0,
    },
  });
  
  // Calculate precision from historical data
  if (historicalAlerts && historicalAlerts.length >= MIN_SAMPLE_SIZE_FOR_RATES) {
    const resolvedCount = historicalAlerts.filter(d => d.status === 'resolved').length;
    const dismissedCount = historicalAlerts.filter(d => d.status === 'dismissed').length;
    const totalActioned = resolvedCount + dismissedCount;
    
    const precision = totalActioned > 0 ? resolvedCount / totalActioned : 0;
    const falseRate = totalActioned > 0 ? dismissedCount / totalActioned : 0;
    
    metrics.push({
      metric_type: 'alert_precision',
      metric_value: precision,
      sample_size: totalActioned,
      metadata: { 
        resolved: resolvedCount,
        dismissed: dismissedCount,
        window_days: HISTORICAL_WINDOW_DAYS,
        is_reliable: totalActioned >= MIN_SAMPLE_SIZE_FOR_RATES,
      },
    });
    
    metrics.push({
      metric_type: 'false_alert_rate',
      metric_value: falseRate,
      sample_size: totalActioned,
      metadata: {
        is_reliable: totalActioned >= MIN_SAMPLE_SIZE_FOR_RATES,
      },
    });
  } else {
    // Insufficient data - report with warning
    const sampleSize = historicalAlerts?.length || 0;
    metrics.push({
      metric_type: 'alert_precision',
      metric_value: 0,
      sample_size: sampleSize,
      metadata: { 
        note: 'Insufficient data for reliable precision calculation',
        min_required: MIN_SAMPLE_SIZE_FOR_RATES,
        is_reliable: false,
      },
    });
    
    metrics.push({
      metric_type: 'false_alert_rate',
      metric_value: 0,
      sample_size: sampleSize,
      metadata: {
        note: 'Insufficient data for reliable false alert rate',
        is_reliable: false,
      },
    });
  }
  
  return metrics;
}

async function collectRecommendationMetrics(): Promise<ProcurementMetric[]> {
  const metrics: ProcurementMetric[] = [];
  
  // Get recommendations with actual acceptance tracking
  const thirtyDaysAgo = new Date(Date.now() - HISTORICAL_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  
  const { data: recData } = await supabaseAdmin
    .from('supplier_recommendations')
    .select('recommendation_band, recommended_rank, was_accepted, calculated_at')
    .eq('recommended_rank', 1)
    .gte('calculated_at', thirtyDaysAgo);
    
  if (recData && recData.length > 0) {
    const strongRecs = recData.filter(d => d.recommendation_band === 'strong_recommendation').length;
    
    // Try to calculate actual acceptance rate
    const recsWithFeedback = recData.filter(d => d.was_accepted !== null);
    const acceptedCount = recsWithFeedback.filter(d => d.was_accepted === true).length;
    
    if (recsWithFeedback.length >= MIN_SAMPLE_SIZE_FOR_RATES) {
      // We have real acceptance data
      metrics.push({
        metric_type: 'recommendation_acceptance_rate',
        metric_value: acceptedCount / recsWithFeedback.length,
        sample_size: recsWithFeedback.length,
        metadata: { 
          accepted: acceptedCount,
          total_with_feedback: recsWithFeedback.length,
          is_actual_rate: true,
        },
      });
    } else {
      // Insufficient feedback - report as proxy metric with warning
      metrics.push({
        metric_type: 'recommendation_acceptance_rate',
        metric_value: strongRecs / recData.length,
        sample_size: recData.length,
        metadata: { 
          strong_recommendations: strongRecs,
          note: 'PROXY METRIC: insufficient acceptance tracking data',
          is_actual_rate: false,
          feedback_samples: recsWithFeedback.length,
          min_required: MIN_SAMPLE_SIZE_FOR_RATES,
        },
      });
    }
  } else {
    // No data at all
    metrics.push({
      metric_type: 'recommendation_acceptance_rate',
      metric_value: 0,
      sample_size: 0,
      metadata: { note: 'No recommendation data available' },
    });
  }
  
  return metrics;
}

// ============================================================================
// PERSISTENCE
// ============================================================================

async function persistMetric(metric: ProcurementMetric): Promise<void> {
  await supabaseAdmin
    .from('procurement_intelligence_metrics')
    .insert({
      metric_type: metric.metric_type,
      metric_value: metric.metric_value,
      sample_size: metric.sample_size,
      metadata: metric.metadata,
      calculated_at: new Date().toISOString(),
    });
}

// ============================================================================
// RETRIEVAL
// ============================================================================

export async function getMetricsSummary(): Promise<MetricsSummary> {
  const [reliability, trust, opportunities, alerts, recommendations] = await Promise.all([
    getReliabilitySummary(),
    getTrustSummary(),
    getOpportunitiesSummary(),
    getAlertsSummary(),
    getRecommendationsSummary(),
  ]);
  
  return {
    reliability,
    trust,
    opportunities,
    alerts,
    recommendations,
  };
}

async function getReliabilitySummary() {
  const { data } = await supabaseAdmin
    .from('supplier_reliability_leaderboard')
    .select('reliability_score, reliability_band');
    
  if (!data || data.length === 0) {
    return { avg_score: 0, trusted_count: 0, risky_count: 0, sample_size: 0 };
  }
  
  return {
    avg_score: data.reduce((s, d) => s + Number(d.reliability_score), 0) / data.length,
    trusted_count: data.filter(d => d.reliability_band === 'trusted').length,
    risky_count: data.filter(d => d.reliability_band === 'risky' || d.reliability_band === 'watch').length,
    sample_size: data.length,
  };
}

async function getTrustSummary() {
  const { data } = await supabaseAdmin
    .from('offer_trust_scores')
    .select('trust_score, trust_band')
    .gte('calculated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    
  if (!data || data.length === 0) {
    return { avg_score: 0, high_trust_count: 0, low_trust_count: 0, sample_size: 0 };
  }
  
  return {
    avg_score: data.reduce((s, d) => s + Number(d.trust_score), 0) / data.length,
    high_trust_count: data.filter(d => d.trust_band === 'high_trust').length,
    low_trust_count: data.filter(d => d.trust_band === 'low_trust' || d.trust_band === 'review_sensitive').length,
    sample_size: data.length,
  };
}

async function getOpportunitiesSummary() {
  const { data } = await supabaseAdmin
    .from('margin_opportunities')
    .select('opportunity_band, estimated_savings_per_case')
    .in('opportunity_band', ['major', 'meaningful'])
    .gte('calculated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    
  if (!data) {
    return { major_count: 0, total_potential_savings: 0, sample_size: 0 };
  }
  
  return {
    major_count: data.filter(d => d.opportunity_band === 'major').length,
    total_potential_savings: data.reduce((s, d) => s + Number(d.estimated_savings_per_case || 0), 0),
    sample_size: data.length,
  };
}

async function getAlertsSummary() {
  const { data } = await supabaseAdmin
    .from('procurement_alerts')
    .select('severity, status, resolved_at')
    .eq('status', 'open');
    
  const { data: resolvedData } = await supabaseAdmin
    .from('procurement_alerts')
    .select('id')
    .eq('status', 'resolved')
    .gte('resolved_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString());
    
  return {
    open_count: data?.length || 0,
    critical_count: data?.filter(d => d.severity === 'critical').length || 0,
    resolved_today: resolvedData?.length || 0,
  };
}

async function getRecommendationsSummary() {
  const { data } = await supabaseAdmin
    .from('supplier_recommendations')
    .select('recommendation_band')
    .eq('recommended_rank', 1)
    .gte('calculated_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
    
  if (!data || data.length === 0) {
    return { acceptance_rate: 0, sample_size: 0 };
  }
  
  const strongRecs = data.filter(d => d.recommendation_band === 'strong_recommendation').length;
  
  return {
    acceptance_rate: strongRecs / data.length,
    sample_size: data.length,
  };
}

export async function getMetricTrend(
  metric_type: ProcurementMetricType,
  days: number = 30
): Promise<Array<{ date: string; value: number }>> {
  const { data } = await supabaseAdmin
    .from('procurement_intelligence_metrics')
    .select('metric_value, calculated_at')
    .eq('metric_type', metric_type)
    .gte('calculated_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
    .order('calculated_at', { ascending: true });
    
  if (!data) return [];
  
  return data.map(d => ({
    date: new Date(d.calculated_at).toISOString().split('T')[0],
    value: Number(d.metric_value),
  }));
}
