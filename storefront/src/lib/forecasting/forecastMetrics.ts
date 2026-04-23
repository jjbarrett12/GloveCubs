/**
 * Forecast Quality Metrics
 * 
 * Measures the accuracy and quality of forecasts and guidance.
 * 
 * Metric types:
 * - supplier_forecast_precision
 * - supplier_forecast_recall
 * - price_volatility_forecast_precision
 * - commercial_guidance_acceptance_rate
 * - commercial_guidance_precision
 * - false_positive_guidance_rate
 */

import { supabaseAdmin } from '../jobs/supabase';

// ============================================================================
// TYPES
// ============================================================================

export type ForecastMetricType = 
  | 'supplier_forecast_precision'
  | 'supplier_forecast_recall'
  | 'price_volatility_forecast_precision'
  | 'commercial_guidance_acceptance_rate'
  | 'commercial_guidance_precision'
  | 'false_positive_guidance_rate';

export interface ForecastMetric {
  metric_type: ForecastMetricType;
  metric_value: number;
  sample_size: number;
  window_start: string;
  window_end: string;
  metadata?: Record<string, unknown>;
}

export interface ForecastQualityReport {
  window_start: string;
  window_end: string;
  metrics: ForecastMetric[];
  summary: {
    overall_quality: 'good' | 'acceptable' | 'poor';
    supplier_forecast_quality: number;
    volatility_forecast_quality: number;
    guidance_quality: number;
  };
  recommendations: string[];
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const METRICS_CONFIG = {
  min_sample_size: 15,            // Increased from 10 for statistical validity
  good_precision_threshold: 0.7,
  acceptable_precision_threshold: 0.5,
  good_acceptance_threshold: 0.6,
  
  // Deterioration detection - use percentage-based threshold
  deterioration_threshold_percent: 0.08, // 8% relative decline = deterioration
  deterioration_threshold_absolute: 0.03, // OR 3 points absolute decline
};

// ============================================================================
// METRIC CALCULATION
// ============================================================================

export async function calculateForecastQualityMetrics(
  window_days: number = 30
): Promise<ForecastMetric[]> {
  const window_end = new Date().toISOString();
  const window_start = new Date(Date.now() - window_days * 24 * 60 * 60 * 1000).toISOString();
  
  const metrics: ForecastMetric[] = [];
  
  // Calculate each metric
  metrics.push(await calculateSupplierForecastPrecision(window_start, window_end));
  metrics.push(await calculateSupplierForecastRecall(window_start, window_end));
  metrics.push(await calculateVolatilityForecastPrecision(window_start, window_end));
  metrics.push(await calculateGuidanceAcceptanceRate(window_start, window_end));
  metrics.push(await calculateGuidancePrecision(window_start, window_end));
  metrics.push(await calculateFalsePositiveGuidanceRate(window_start, window_end));
  
  // Persist metrics
  for (const metric of metrics) {
    await persistForecastMetric(metric);
  }
  
  return metrics;
}

// ============================================================================
// INDIVIDUAL METRICS
// ============================================================================

async function calculateSupplierForecastPrecision(
  window_start: string,
  window_end: string
): Promise<ForecastMetric> {
  // How many "deteriorating" forecasts actually resulted in deterioration?
  // Compare forecasts from window_start with actual reliability at window_end
  
  const { data: forecasts } = await supabaseAdmin
    .from('supplier_forecasts')
    .select('supplier_id, predicted_direction, forecast_score')
    .eq('predicted_direction', 'deteriorating')
    .gte('forecast_as_of', window_start)
    .lt('forecast_as_of', window_end);
    
  if (!forecasts || forecasts.length < METRICS_CONFIG.min_sample_size) {
    return {
      metric_type: 'supplier_forecast_precision',
      metric_value: 0,
      sample_size: forecasts?.length || 0,
      window_start,
      window_end,
      metadata: { insufficient_data: true },
    };
  }
  
  // Check if suppliers actually deteriorated
  let truePositives = 0;
  let evaluatedCount = 0;
  
  for (const forecast of forecasts) {
    // Get reliability scores before and after forecast
    const { data: recentScore } = await supabaseAdmin
      .from('supplier_reliability_scores')
      .select('reliability_score')
      .eq('supplier_id', forecast.supplier_id)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .single();
      
    const { data: olderScore } = await supabaseAdmin
      .from('supplier_reliability_scores')
      .select('reliability_score')
      .eq('supplier_id', forecast.supplier_id)
      .lt('calculated_at', window_start)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .single();
      
    if (recentScore && olderScore) {
      evaluatedCount++;
      const recent = Number(recentScore.reliability_score);
      const older = Number(olderScore.reliability_score);
      const actualDelta = recent - older;
      
      // Use percentage-based OR absolute threshold for deterioration detection
      // This handles both high-reliability suppliers (where 0.95->0.91 is significant)
      // and lower-reliability suppliers (where 0.60->0.55 is significant)
      const percentChange = older > 0 ? actualDelta / older : 0;
      const isDeterioration = 
        actualDelta < -METRICS_CONFIG.deterioration_threshold_absolute ||
        percentChange < -METRICS_CONFIG.deterioration_threshold_percent;
      
      if (isDeterioration) {
        truePositives++;
      }
    }
  }
  
  const precision = forecasts.length > 0 ? truePositives / forecasts.length : 0;
  
  return {
    metric_type: 'supplier_forecast_precision',
    metric_value: precision,
    sample_size: forecasts.length,
    window_start,
    window_end,
    metadata: {
      true_positives: truePositives,
      total_predictions: forecasts.length,
    },
  };
}

async function calculateSupplierForecastRecall(
  window_start: string,
  window_end: string
): Promise<ForecastMetric> {
  // How many actual deteriorations were predicted?
  
  // Find suppliers that actually deteriorated
  const { data: allSuppliers } = await supabaseAdmin
    .from('suppliers')
    .select('id')
    .eq('is_active', true);
    
  if (!allSuppliers) {
    return {
      metric_type: 'supplier_forecast_recall',
      metric_value: 0,
      sample_size: 0,
      window_start,
      window_end,
    };
  }
  
  let actualDeteriorations = 0;
  let correctlyPredicted = 0;
  
  for (const supplier of allSuppliers) {
    const supplierId = (supplier as { id: string }).id;
    
    // Check if actually deteriorated
    const { data: recentScore } = await supabaseAdmin
      .from('supplier_reliability_scores')
      .select('reliability_score')
      .eq('supplier_id', supplierId)
      .gte('calculated_at', window_start)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .single();
      
    const { data: olderScore } = await supabaseAdmin
      .from('supplier_reliability_scores')
      .select('reliability_score')
      .eq('supplier_id', supplierId)
      .lt('calculated_at', window_start)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .single();
      
    if (recentScore && olderScore) {
      const recent = Number(recentScore.reliability_score);
      const older = Number(olderScore.reliability_score);
      const actualDelta = recent - older;
      
      // Use same percentage-based OR absolute threshold
      const percentChange = older > 0 ? actualDelta / older : 0;
      const isDeterioration = 
        actualDelta < -METRICS_CONFIG.deterioration_threshold_absolute ||
        percentChange < -METRICS_CONFIG.deterioration_threshold_percent;
      
      if (isDeterioration) {
        actualDeteriorations++;
        
        // Check if we predicted it
        const { data: forecast } = await supabaseAdmin
          .from('supplier_forecasts')
          .select('predicted_direction')
          .eq('supplier_id', supplierId)
          .eq('predicted_direction', 'deteriorating')
          .gte('forecast_as_of', window_start)
          .limit(1)
          .single();
          
        if (forecast) {
          correctlyPredicted++;
        }
      }
    }
  }
  
  const recall = actualDeteriorations > 0 ? correctlyPredicted / actualDeteriorations : 0;
  
  return {
    metric_type: 'supplier_forecast_recall',
    metric_value: recall,
    sample_size: actualDeteriorations,
    window_start,
    window_end,
    metadata: {
      actual_deteriorations: actualDeteriorations,
      correctly_predicted: correctlyPredicted,
    },
  };
}

async function calculateVolatilityForecastPrecision(
  window_start: string,
  window_end: string
): Promise<ForecastMetric> {
  // How many "high_volatility" forecasts were accurate?
  
  const { data: forecasts } = await supabaseAdmin
    .from('price_volatility_forecasts')
    .select('product_id, volatility_band, volatility_score')
    .in('volatility_band', ['high_volatility', 'elevated'])
    .gte('forecast_as_of', window_start)
    .lt('forecast_as_of', window_end);
    
  if (!forecasts || forecasts.length < METRICS_CONFIG.min_sample_size) {
    return {
      metric_type: 'price_volatility_forecast_precision',
      metric_value: 0,
      sample_size: forecasts?.length || 0,
      window_start,
      window_end,
      metadata: { insufficient_data: true },
    };
  }
  
  // Check for actual volatility (anomalies or price swings)
  let confirmedVolatile = 0;
  
  for (const forecast of forecasts) {
    const { data: anomalies } = await supabaseAdmin
      .from('ai_pricing_analysis')
      .select('id')
      .eq('canonical_product_id', forecast.product_id)
      .eq('is_suspicious', true)
      .gte('created_at', window_start)
      .limit(3);
      
    if (anomalies && anomalies.length >= 2) {
      confirmedVolatile++;
    }
  }
  
  const precision = forecasts.length > 0 ? confirmedVolatile / forecasts.length : 0;
  
  return {
    metric_type: 'price_volatility_forecast_precision',
    metric_value: precision,
    sample_size: forecasts.length,
    window_start,
    window_end,
    metadata: {
      confirmed_volatile: confirmedVolatile,
      total_predictions: forecasts.length,
    },
  };
}

async function calculateGuidanceAcceptanceRate(
  window_start: string,
  window_end: string
): Promise<ForecastMetric> {
  // How many guidance items were actioned?
  
  const { data: guidance } = await supabaseAdmin
    .from('commercial_guidance_recommendations')
    .select('status')
    .gte('created_at', window_start)
    .lt('created_at', window_end)
    .in('status', ['actioned', 'dismissed', 'expired']);
    
  if (!guidance || guidance.length < METRICS_CONFIG.min_sample_size) {
    return {
      metric_type: 'commercial_guidance_acceptance_rate',
      metric_value: 0,
      sample_size: guidance?.length || 0,
      window_start,
      window_end,
      metadata: { insufficient_data: true },
    };
  }
  
  const actioned = guidance.filter(g => g.status === 'actioned').length;
  const rate = actioned / guidance.length;
  
  return {
    metric_type: 'commercial_guidance_acceptance_rate',
    metric_value: rate,
    sample_size: guidance.length,
    window_start,
    window_end,
    metadata: {
      actioned: actioned,
      dismissed: guidance.filter(g => g.status === 'dismissed').length,
      expired: guidance.filter(g => g.status === 'expired').length,
    },
  };
}

async function calculateGuidancePrecision(
  window_start: string,
  window_end: string
): Promise<ForecastMetric> {
  // Actioned / (Actioned + Dismissed)
  
  const { data: guidance } = await supabaseAdmin
    .from('commercial_guidance_recommendations')
    .select('status')
    .gte('created_at', window_start)
    .lt('created_at', window_end)
    .in('status', ['actioned', 'dismissed']);
    
  if (!guidance || guidance.length < METRICS_CONFIG.min_sample_size) {
    return {
      metric_type: 'commercial_guidance_precision',
      metric_value: 0,
      sample_size: guidance?.length || 0,
      window_start,
      window_end,
      metadata: { insufficient_data: true },
    };
  }
  
  const actioned = guidance.filter(g => g.status === 'actioned').length;
  const precision = actioned / guidance.length;
  
  return {
    metric_type: 'commercial_guidance_precision',
    metric_value: precision,
    sample_size: guidance.length,
    window_start,
    window_end,
  };
}

async function calculateFalsePositiveGuidanceRate(
  window_start: string,
  window_end: string
): Promise<ForecastMetric> {
  // False positive = dismissed / (actioned + dismissed)
  // Exclude expired - those are inconclusive, not false positives
  // This gives us a cleaner signal about guidance accuracy
  
  const { data: guidance } = await supabaseAdmin
    .from('commercial_guidance_recommendations')
    .select('status, action_notes, guidance_band')
    .gte('created_at', window_start)
    .lt('created_at', window_end)
    .in('status', ['actioned', 'dismissed', 'expired']);
    
  if (!guidance || guidance.length < METRICS_CONFIG.min_sample_size) {
    return {
      metric_type: 'false_positive_guidance_rate',
      metric_value: -1,  // Use -1 for insufficient data
      sample_size: guidance?.length || 0,
      window_start,
      window_end,
      metadata: { insufficient_data: true },
    };
  }
  
  // Only count actioned and dismissed for FP calculation
  const actioned = guidance.filter(g => g.status === 'actioned');
  const dismissed = guidance.filter(g => g.status === 'dismissed');
  const expired = guidance.filter(g => g.status === 'expired');
  
  const decidedCount = actioned.length + dismissed.length;
  
  if (decidedCount < 5) {
    // Not enough decided guidance to calculate meaningful FP rate
    return {
      metric_type: 'false_positive_guidance_rate',
      metric_value: -1,
      sample_size: guidance.length,
      window_start,
      window_end,
      metadata: { 
        insufficient_decisions: true,
        actioned_count: actioned.length,
        dismissed_count: dismissed.length,
        expired_count: expired.length,
      },
    };
  }
  
  // Calculate FP rate only among decided (actioned + dismissed)
  const fpRate = dismissed.length / decidedCount;
  
  // Also calculate by band for more granular analysis
  const byBand: Record<string, { actioned: number; dismissed: number }> = {};
  for (const g of [...actioned, ...dismissed]) {
    if (!byBand[g.guidance_band]) {
      byBand[g.guidance_band] = { actioned: 0, dismissed: 0 };
    }
    if (g.status === 'actioned') byBand[g.guidance_band].actioned++;
    else byBand[g.guidance_band].dismissed++;
  }
  
  return {
    metric_type: 'false_positive_guidance_rate',
    metric_value: fpRate,
    sample_size: decidedCount,
    window_start,
    window_end,
    metadata: {
      actioned_count: actioned.length,
      dismissed_count: dismissed.length,
      expired_count: expired.length,
      total_resolved: guidance.length,
      by_band: byBand,
    },
  };
}

// ============================================================================
// PERSISTENCE
// ============================================================================

async function persistForecastMetric(metric: ForecastMetric): Promise<void> {
  await supabaseAdmin
    .from('forecast_quality_metrics')
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

export async function generateForecastQualityReport(
  window_days: number = 30
): Promise<ForecastQualityReport> {
  const window_end = new Date().toISOString();
  const window_start = new Date(Date.now() - window_days * 24 * 60 * 60 * 1000).toISOString();
  
  const metrics = await calculateForecastQualityMetrics(window_days);
  
  // Calculate summary scores
  const supplierPrecision = metrics.find(m => m.metric_type === 'supplier_forecast_precision')?.metric_value || 0;
  const supplierRecall = metrics.find(m => m.metric_type === 'supplier_forecast_recall')?.metric_value || 0;
  const volatilityPrecision = metrics.find(m => m.metric_type === 'price_volatility_forecast_precision')?.metric_value || 0;
  const guidancePrecision = metrics.find(m => m.metric_type === 'commercial_guidance_precision')?.metric_value || 0;
  const guidanceAcceptance = metrics.find(m => m.metric_type === 'commercial_guidance_acceptance_rate')?.metric_value || 0;
  
  const supplier_forecast_quality = (supplierPrecision + supplierRecall) / 2;
  const volatility_forecast_quality = volatilityPrecision;
  const guidance_quality = (guidancePrecision + guidanceAcceptance) / 2;
  
  // Determine overall quality
  const avgQuality = (supplier_forecast_quality + volatility_forecast_quality + guidance_quality) / 3;
  let overall_quality: 'good' | 'acceptable' | 'poor' = 'poor';
  if (avgQuality >= METRICS_CONFIG.good_precision_threshold) {
    overall_quality = 'good';
  } else if (avgQuality >= METRICS_CONFIG.acceptable_precision_threshold) {
    overall_quality = 'acceptable';
  }
  
  // Generate recommendations
  const recommendations: string[] = [];
  
  if (supplierPrecision < 0.5) {
    recommendations.push('Supplier deterioration forecasts showing high false positive rate - consider tightening thresholds');
  }
  
  if (supplierRecall < 0.5) {
    recommendations.push('Missing many actual supplier deteriorations - consider loosening detection thresholds');
  }
  
  if (volatilityPrecision < 0.5) {
    recommendations.push('Volatility forecasts frequently incorrect - review signal quality');
  }
  
  if (guidanceAcceptance < 0.4) {
    recommendations.push('Commercial guidance rarely actioned - may indicate low relevance or noise');
  }
  
  const falsePositiveRate = metrics.find(m => m.metric_type === 'false_positive_guidance_rate')?.metric_value || 0;
  if (falsePositiveRate > 0.3) {
    recommendations.push('High false positive rate in guidance - tighten suppression rules');
  }
  
  return {
    window_start,
    window_end,
    metrics,
    summary: {
      overall_quality,
      supplier_forecast_quality,
      volatility_forecast_quality,
      guidance_quality,
    },
    recommendations,
  };
}

// ============================================================================
// RETRIEVAL
// ============================================================================

export async function getForecastMetricTrend(
  metric_type: ForecastMetricType,
  days: number = 90
): Promise<Array<{ date: string; value: number; sample_size: number }>> {
  const { data } = await supabaseAdmin
    .from('forecast_quality_metrics')
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
