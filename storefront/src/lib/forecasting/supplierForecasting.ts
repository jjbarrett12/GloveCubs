/**
 * Supplier Deterioration Forecasting
 * 
 * Predicts which suppliers are likely to deteriorate in reliability.
 * 
 * SAFETY RULES:
 * - Require minimum sample sizes
 * - Prefer conservative forecasts over aggressive predictions
 * - Persist explicit reasoning
 * - Do not emit forecasts when evidence is weak
 * - Label all outputs as predictive guidance, not facts
 */

import { supabaseAdmin } from '../jobs/supabase';

// ============================================================================
// TYPES
// ============================================================================

export type ForecastType = 
  | 'reliability_deterioration'
  | 'review_load_risk'
  | 'override_risk'
  | 'freshness_risk';

export type ForecastBand = 'high_risk' | 'watch' | 'stable' | 'improving';
export type PredictedDirection = 'deteriorating' | 'stable' | 'improving' | 'insufficient_signal';

export interface SupplierForecast {
  supplier_id: string;
  forecast_type: ForecastType;
  forecast_score: number;
  forecast_band: ForecastBand;
  predicted_direction: PredictedDirection;
  predicted_impact: string;
  reasoning: string;
  evidence: ForecastEvidence;
  window_days: number;
  sample_size: number;
  confidence: number;
}

export interface ForecastEvidence {
  recent_score?: number;
  previous_score?: number;
  score_delta?: number;
  trend_direction?: string;
  anomaly_count?: number;
  override_count?: number;
  review_count?: number;
  freshness_decline?: number;
  data_points?: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const FORECAST_CONFIG = {
  min_sample_size: 15,              // Increased from 10 for better statistical validity
  min_recent_samples: 5,            // Require minimum recent samples to detect trends
  min_previous_samples: 5,          // Require minimum previous samples for comparison
  min_confidence_threshold: 0.5,    // Increased from 0.4
  window_days: 30,
  comparison_window_days: 60,
  high_confidence_sample_size: 50,  // Full confidence at 50 samples
  
  // Thresholds for deterioration detection
  score_decline_threshold: 0.1,     // 10% decline triggers concern
  anomaly_rate_threshold: 0.15,     // 15% anomaly rate is concerning
  override_rate_threshold: 0.35,    // Increased from 0.3 - need stronger signal
  freshness_decline_threshold: 0.2, // 20% freshness decline
  
  // Band thresholds
  high_risk_threshold: 0.7,
  watch_threshold: 0.4,
};

// ============================================================================
// MAIN FORECASTING FUNCTION
// ============================================================================

export async function generateSupplierForecasts(): Promise<{
  generated: number;
  suppressed: number;
  by_type: Record<ForecastType, number>;
}> {
  const by_type: Record<ForecastType, number> = {
    reliability_deterioration: 0,
    review_load_risk: 0,
    override_risk: 0,
    freshness_risk: 0,
  };
  
  let generated = 0;
  let suppressed = 0;
  
  // Get all active suppliers
  const { data: suppliers } = await supabaseAdmin
    .from('suppliers')
    .select('id')
    .eq('is_active', true);
    
  if (!suppliers) return { generated: 0, suppressed: 0, by_type };
  
  for (const supplier of suppliers) {
    const supplierId = (supplier as { id: string }).id;
    
    // Generate each forecast type
    for (const forecastType of Object.keys(by_type) as ForecastType[]) {
      const forecast = await generateForecast(supplierId, forecastType);
      
      if (forecast) {
        if (forecast.predicted_direction !== 'insufficient_signal') {
          await persistSupplierForecast(forecast);
          generated++;
          by_type[forecastType]++;
        } else {
          suppressed++;
        }
      }
    }
  }
  
  return { generated, suppressed, by_type };
}

// ============================================================================
// INDIVIDUAL FORECAST GENERATION
// ============================================================================

async function generateForecast(
  supplier_id: string,
  forecast_type: ForecastType
): Promise<SupplierForecast | null> {
  switch (forecast_type) {
    case 'reliability_deterioration':
      return generateReliabilityDeterioration(supplier_id);
    case 'review_load_risk':
      return generateReviewLoadRisk(supplier_id);
    case 'override_risk':
      return generateOverrideRisk(supplier_id);
    case 'freshness_risk':
      return generateFreshnessRisk(supplier_id);
    default:
      return null;
  }
}

async function generateReliabilityDeterioration(
  supplier_id: string
): Promise<SupplierForecast> {
  // Get recent and previous reliability scores
  const { data: recentScores } = await supabaseAdmin
    .from('supplier_reliability_scores')
    .select('reliability_score, calculated_at')
    .eq('supplier_id', supplier_id)
    .gte('calculated_at', new Date(Date.now() - FORECAST_CONFIG.window_days * 24 * 60 * 60 * 1000).toISOString())
    .order('calculated_at', { ascending: false });
    
  const { data: previousScores } = await supabaseAdmin
    .from('supplier_reliability_scores')
    .select('reliability_score, calculated_at')
    .eq('supplier_id', supplier_id)
    .gte('calculated_at', new Date(Date.now() - FORECAST_CONFIG.comparison_window_days * 24 * 60 * 60 * 1000).toISOString())
    .lt('calculated_at', new Date(Date.now() - FORECAST_CONFIG.window_days * 24 * 60 * 60 * 1000).toISOString())
    .order('calculated_at', { ascending: false });
    
  const recentCount = recentScores?.length || 0;
  const previousCount = previousScores?.length || 0;
  const sample_size = recentCount + previousCount;
  
  // Insufficient data check - need both recent AND previous samples for trend detection
  if (sample_size < FORECAST_CONFIG.min_sample_size) {
    return createInsufficientSignalForecast(supplier_id, 'reliability_deterioration', sample_size);
  }
  
  // Require minimum samples in both windows for valid comparison
  if (recentCount < FORECAST_CONFIG.min_recent_samples || 
      previousCount < FORECAST_CONFIG.min_previous_samples) {
    return {
      ...createInsufficientSignalForecast(supplier_id, 'reliability_deterioration', sample_size),
      reasoning: `Insufficient data for trend comparison: ${recentCount} recent, ${previousCount} previous (need ${FORECAST_CONFIG.min_recent_samples}/${FORECAST_CONFIG.min_previous_samples})`,
    };
  }
  
  // Calculate average scores - both windows must have data at this point
  const recentAvg = recentScores!.reduce((sum, s) => sum + Number(s.reliability_score), 0) / recentCount;
  const previousAvg = previousScores!.reduce((sum, s) => sum + Number(s.reliability_score), 0) / previousCount;
    
  const scoreDelta = recentAvg - previousAvg;
  const declinePercent = previousAvg > 0 ? -scoreDelta / previousAvg : 0;
  
  // Determine direction and band
  let predicted_direction: PredictedDirection = 'stable';
  let forecast_band: ForecastBand = 'stable';
  let forecast_score = 0;
  
  if (declinePercent >= FORECAST_CONFIG.score_decline_threshold) {
    predicted_direction = 'deteriorating';
    forecast_score = Math.min(1, declinePercent * 2);
    forecast_band = forecast_score >= FORECAST_CONFIG.high_risk_threshold 
      ? 'high_risk' 
      : forecast_score >= FORECAST_CONFIG.watch_threshold 
        ? 'watch' 
        : 'stable';
  } else if (scoreDelta > 0.05) {
    predicted_direction = 'improving';
    forecast_band = 'improving';
    forecast_score = 0;
  }
  
  const confidence = calculateConfidence(sample_size, Math.abs(scoreDelta));
  
  const reasoning = generateReliabilityReasoning(
    recentAvg,
    previousAvg,
    scoreDelta,
    sample_size
  );
  
  return {
    supplier_id,
    forecast_type: 'reliability_deterioration',
    forecast_score,
    forecast_band,
    predicted_direction,
    predicted_impact: forecast_band === 'high_risk' 
      ? 'May cause increased review load and recommendation rejections'
      : forecast_band === 'watch'
        ? 'Monitor for continued decline'
        : 'No immediate impact expected',
    reasoning,
    evidence: {
      recent_score: recentAvg,
      previous_score: previousAvg,
      score_delta: scoreDelta,
      trend_direction: predicted_direction,
      data_points: sample_size,
    },
    window_days: FORECAST_CONFIG.window_days,
    sample_size,
    confidence,
  };
}

async function generateReviewLoadRisk(
  supplier_id: string
): Promise<SupplierForecast> {
  // Get review counts in recent vs previous windows
  const { data: recentReviews } = await supabaseAdmin
    .from('review_queue')
    .select('id')
    .eq('source_table', 'supplier_products')
    .gte('created_at', new Date(Date.now() - FORECAST_CONFIG.window_days * 24 * 60 * 60 * 1000).toISOString());
    
  const { data: previousReviews } = await supabaseAdmin
    .from('review_queue')
    .select('id')
    .eq('source_table', 'supplier_products')
    .gte('created_at', new Date(Date.now() - FORECAST_CONFIG.comparison_window_days * 24 * 60 * 60 * 1000).toISOString())
    .lt('created_at', new Date(Date.now() - FORECAST_CONFIG.window_days * 24 * 60 * 60 * 1000).toISOString());
    
  const recentCount = recentReviews?.length || 0;
  const previousCount = previousReviews?.length || 0;
  const sample_size = recentCount + previousCount;
  
  if (sample_size < FORECAST_CONFIG.min_sample_size) {
    return createInsufficientSignalForecast(supplier_id, 'review_load_risk', sample_size);
  }
  
  // Calculate growth rate
  const growthRate = previousCount > 0 
    ? (recentCount - previousCount) / previousCount 
    : recentCount > 0 ? 1 : 0;
    
  let predicted_direction: PredictedDirection = 'stable';
  let forecast_band: ForecastBand = 'stable';
  let forecast_score = 0;
  
  if (growthRate > 0.5) { // 50% increase
    predicted_direction = 'deteriorating';
    forecast_score = Math.min(1, growthRate);
    forecast_band = forecast_score >= FORECAST_CONFIG.high_risk_threshold 
      ? 'high_risk' 
      : forecast_score >= FORECAST_CONFIG.watch_threshold 
        ? 'watch' 
        : 'stable';
  } else if (growthRate < -0.2) { // 20% decrease
    predicted_direction = 'improving';
    forecast_band = 'improving';
  }
  
  const confidence = calculateConfidence(sample_size, Math.abs(growthRate));
  
  return {
    supplier_id,
    forecast_type: 'review_load_risk',
    forecast_score,
    forecast_band,
    predicted_direction,
    predicted_impact: forecast_band === 'high_risk'
      ? 'Significant increase in operator review workload expected'
      : 'Normal review load trajectory',
    reasoning: `Review items changed from ${previousCount} to ${recentCount} (${(growthRate * 100).toFixed(0)}% change)`,
    evidence: {
      recent_score: recentCount,
      previous_score: previousCount,
      score_delta: recentCount - previousCount,
      review_count: recentCount,
      data_points: sample_size,
    },
    window_days: FORECAST_CONFIG.window_days,
    sample_size,
    confidence,
  };
}

async function generateOverrideRisk(
  supplier_id: string
): Promise<SupplierForecast> {
  // Get recommendation outcomes for this supplier
  const { data: outcomes } = await supabaseAdmin
    .from('recommendation_outcomes')
    .select('outcome_status, selected_supplier_id, supplier_id')
    .eq('supplier_id', supplier_id)
    .in('outcome_status', ['accepted', 'rejected'])
    .gte('created_at', new Date(Date.now() - FORECAST_CONFIG.window_days * 24 * 60 * 60 * 1000).toISOString());
    
  const sample_size = outcomes?.length || 0;
  
  if (sample_size < FORECAST_CONFIG.min_sample_size) {
    return createInsufficientSignalForecast(supplier_id, 'override_risk', sample_size);
  }
  
  // Calculate override rate
  const overridden = outcomes?.filter(o => 
    o.outcome_status === 'accepted' && 
    o.selected_supplier_id && 
    o.selected_supplier_id !== o.supplier_id
  ).length || 0;
  
  const rejected = outcomes?.filter(o => o.outcome_status === 'rejected').length || 0;
  const overrideRate = (overridden + rejected) / sample_size;
  
  let predicted_direction: PredictedDirection = 'stable';
  let forecast_band: ForecastBand = 'stable';
  let forecast_score = overrideRate;
  
  if (overrideRate >= FORECAST_CONFIG.override_rate_threshold) {
    predicted_direction = 'deteriorating';
    forecast_band = overrideRate >= 0.5 ? 'high_risk' : 'watch';
  }
  
  const confidence = calculateConfidence(sample_size, overrideRate);
  
  return {
    supplier_id,
    forecast_type: 'override_risk',
    forecast_score,
    forecast_band,
    predicted_direction,
    predicted_impact: forecast_band === 'high_risk'
      ? 'Recommendations for this supplier frequently rejected - consider alternative sources'
      : 'Recommendation acceptance within normal range',
    reasoning: `${((overridden + rejected))} of ${sample_size} recommendations overridden or rejected (${(overrideRate * 100).toFixed(0)}% override rate)`,
    evidence: {
      override_count: overridden + rejected,
      data_points: sample_size,
    },
    window_days: FORECAST_CONFIG.window_days,
    sample_size,
    confidence,
  };
}

async function generateFreshnessRisk(
  supplier_id: string
): Promise<SupplierForecast> {
  // Get freshness scores over time
  const { data: recentScores } = await supabaseAdmin
    .from('supplier_reliability_scores')
    .select('freshness_score, calculated_at')
    .eq('supplier_id', supplier_id)
    .gte('calculated_at', new Date(Date.now() - FORECAST_CONFIG.window_days * 24 * 60 * 60 * 1000).toISOString())
    .order('calculated_at', { ascending: false });
    
  const { data: previousScores } = await supabaseAdmin
    .from('supplier_reliability_scores')
    .select('freshness_score, calculated_at')
    .eq('supplier_id', supplier_id)
    .gte('calculated_at', new Date(Date.now() - FORECAST_CONFIG.comparison_window_days * 24 * 60 * 60 * 1000).toISOString())
    .lt('calculated_at', new Date(Date.now() - FORECAST_CONFIG.window_days * 24 * 60 * 60 * 1000).toISOString());
    
  const sample_size = (recentScores?.length || 0) + (previousScores?.length || 0);
  
  if (sample_size < FORECAST_CONFIG.min_sample_size) {
    return createInsufficientSignalForecast(supplier_id, 'freshness_risk', sample_size);
  }
  
  const recentAvg = recentScores && recentScores.length > 0
    ? recentScores.reduce((sum, s) => sum + Number(s.freshness_score), 0) / recentScores.length
    : 0;
    
  const previousAvg = previousScores && previousScores.length > 0
    ? previousScores.reduce((sum, s) => sum + Number(s.freshness_score), 0) / previousScores.length
    : recentAvg;
    
  const freshnessDelta = recentAvg - previousAvg;
  const declinePercent = previousAvg > 0 ? -freshnessDelta / previousAvg : 0;
  
  let predicted_direction: PredictedDirection = 'stable';
  let forecast_band: ForecastBand = 'stable';
  let forecast_score = 0;
  
  if (declinePercent >= FORECAST_CONFIG.freshness_decline_threshold) {
    predicted_direction = 'deteriorating';
    forecast_score = Math.min(1, declinePercent * 2);
    forecast_band = forecast_score >= FORECAST_CONFIG.high_risk_threshold 
      ? 'high_risk' 
      : 'watch';
  } else if (freshnessDelta > 0.1) {
    predicted_direction = 'improving';
    forecast_band = 'improving';
  }
  
  const confidence = calculateConfidence(sample_size, Math.abs(declinePercent));
  
  return {
    supplier_id,
    forecast_type: 'freshness_risk',
    forecast_score,
    forecast_band,
    predicted_direction,
    predicted_impact: forecast_band === 'high_risk'
      ? 'Pricing data becoming stale - may affect recommendation accuracy'
      : 'Freshness trajectory acceptable',
    reasoning: `Freshness score changed from ${(previousAvg * 100).toFixed(0)}% to ${(recentAvg * 100).toFixed(0)}% (${(declinePercent * -100).toFixed(0)}% change)`,
    evidence: {
      recent_score: recentAvg,
      previous_score: previousAvg,
      freshness_decline: declinePercent,
      data_points: sample_size,
    },
    window_days: FORECAST_CONFIG.window_days,
    sample_size,
    confidence,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createInsufficientSignalForecast(
  supplier_id: string,
  forecast_type: ForecastType,
  sample_size: number
): SupplierForecast {
  return {
    supplier_id,
    forecast_type,
    forecast_score: 0,
    forecast_band: 'stable',
    predicted_direction: 'insufficient_signal',
    predicted_impact: 'Insufficient data for reliable forecast',
    reasoning: `Only ${sample_size} data points available; minimum ${FORECAST_CONFIG.min_sample_size} required for forecast`,
    evidence: { data_points: sample_size },
    window_days: FORECAST_CONFIG.window_days,
    sample_size,
    confidence: 0,
  };
}

function calculateConfidence(sample_size: number, signal_strength: number): number {
  // Base confidence from sample size - use sqrt curve for diminishing returns
  // This prevents tiny samples from getting high confidence even with strong signals
  const sampleConfidence = Math.min(1, Math.sqrt(sample_size / FORECAST_CONFIG.high_confidence_sample_size));
  
  // Signal strength factor - cap at 0.8 to require some sample size
  const signalFactor = Math.min(0.8, signal_strength * 1.5);
  
  // Combined confidence - sample size weighted more heavily (0.7 vs 0.3)
  // This ensures you need good sample size, not just strong signal
  const rawConfidence = sampleConfidence * 0.7 + signalFactor * 0.3;
  
  // Apply minimum sample penalty - below threshold confidence is capped
  if (sample_size < FORECAST_CONFIG.min_sample_size * 2) {
    return Math.min(rawConfidence, 0.6);
  }
  
  return Math.min(1, rawConfidence);
}

function generateReliabilityReasoning(
  recentAvg: number,
  previousAvg: number,
  delta: number,
  sample_size: number
): string {
  const direction = delta < 0 ? 'declined' : delta > 0 ? 'improved' : 'remained stable';
  const magnitude = Math.abs(delta * 100).toFixed(1);
  
  return `Reliability ${direction} by ${magnitude}% (from ${(previousAvg * 100).toFixed(0)}% to ${(recentAvg * 100).toFixed(0)}%) based on ${sample_size} observations`;
}

// ============================================================================
// PERSISTENCE
// ============================================================================

async function persistSupplierForecast(forecast: SupplierForecast): Promise<void> {
  await supabaseAdmin
    .from('supplier_forecasts')
    .insert({
      supplier_id: forecast.supplier_id,
      forecast_type: forecast.forecast_type,
      forecast_score: forecast.forecast_score,
      forecast_band: forecast.forecast_band,
      predicted_direction: forecast.predicted_direction,
      predicted_impact: forecast.predicted_impact,
      reasoning: forecast.reasoning,
      evidence: forecast.evidence,
      window_days: forecast.window_days,
      sample_size: forecast.sample_size,
      confidence: forecast.confidence,
      forecast_as_of: new Date().toISOString(),
    });
}

// ============================================================================
// RETRIEVAL
// ============================================================================

export async function getSupplierForecasts(
  supplier_id: string
): Promise<SupplierForecast[]> {
  const { data } = await supabaseAdmin.rpc('get_supplier_forecast_summary', {
    p_supplier_id: supplier_id,
  });
  
  if (!data) return [];
  
  return data.map((d: Record<string, unknown>) => ({
    supplier_id,
    forecast_type: d.forecast_type as ForecastType,
    forecast_score: Number(d.forecast_score),
    forecast_band: d.forecast_band as ForecastBand,
    predicted_direction: d.predicted_direction as PredictedDirection,
    predicted_impact: '',
    reasoning: d.reasoning as string,
    evidence: {},
    window_days: FORECAST_CONFIG.window_days,
    sample_size: 0,
    confidence: Number(d.confidence),
  }));
}

export async function getSuppliersLikelyToDeteriorate(
  limit: number = 20
): Promise<SupplierForecast[]> {
  const { data } = await supabaseAdmin
    .from('suppliers_likely_to_deteriorate')
    .select('*')
    .limit(limit);
    
  if (!data) return [];
  
  return data.map(d => ({
    supplier_id: d.supplier_id,
    forecast_type: d.forecast_type as ForecastType,
    forecast_score: Number(d.forecast_score),
    forecast_band: d.forecast_band as ForecastBand,
    predicted_direction: d.predicted_direction as PredictedDirection,
    predicted_impact: d.predicted_impact || '',
    reasoning: d.reasoning,
    evidence: {},
    window_days: FORECAST_CONFIG.window_days,
    sample_size: d.sample_size,
    confidence: Number(d.confidence),
  }));
}
