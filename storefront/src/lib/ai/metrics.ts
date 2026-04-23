/**
 * AI Performance Metrics Service
 * 
 * Records and tracks AI performance over time.
 */

import { supabaseAdmin } from '../jobs/supabase';

// ============================================================================
// TYPES
// ============================================================================

export type MetricType =
  | 'extraction_accuracy'
  | 'match_accuracy'
  | 'pricing_anomaly_precision'
  | 'review_rate'
  | 'auto_approval_rate'
  | 'operator_correction_rate'
  | 'confidence_calibration'
  | 'hard_constraint_accuracy'
  | 'synonym_resolution_rate'
  | 'llm_escalation_rate';

export interface MetricRecord {
  metric_type: MetricType;
  metric_value: number;
  confidence_band?: string;
  sample_size: number;
  pipeline_run_id?: string;
  metadata?: Record<string, unknown>;
}

export interface AggregatedMetrics {
  extraction: {
    accuracy: number;
    sample_count: number;
  };
  matching: {
    accuracy: number;
    hard_constraint_accuracy: number;
    sample_count: number;
  };
  pricing: {
    anomaly_precision: number;
    sample_count: number;
  };
  review: {
    review_rate: number;
    auto_approval_rate: number;
    correction_rate: number;
  };
  llm: {
    escalation_rate: number;
    daily_cost: number;
  };
}

// ============================================================================
// METRIC RECORDING
// ============================================================================

export async function recordAiMetric(metric: MetricRecord): Promise<void> {
  const supabase = supabaseAdmin;
  
  const { error } = await supabase
    .from('ai_performance_metrics')
    .insert({
      metric_type: metric.metric_type,
      metric_value: metric.metric_value,
      confidence_band: metric.confidence_band,
      sample_size: metric.sample_size,
      pipeline_run_id: metric.pipeline_run_id,
      metadata: metric.metadata || {},
    });
    
  if (error) {
    console.error('Failed to record AI metric:', error);
  }
}

export async function recordAiMetrics(
  metrics: MetricRecord[],
  pipeline_run_id?: string
): Promise<void> {
  if (metrics.length === 0) return;
  
  const supabase = supabaseAdmin;
  
  const records = metrics.map(m => ({
    metric_type: m.metric_type,
    metric_value: m.metric_value,
    confidence_band: m.confidence_band,
    sample_size: m.sample_size,
    pipeline_run_id: pipeline_run_id || m.pipeline_run_id,
    metadata: m.metadata || {},
  }));
  
  const { error } = await supabase
    .from('ai_performance_metrics')
    .insert(records);
    
  if (error) {
    console.error('Failed to record AI metrics:', error);
  }
}

// ============================================================================
// PIPELINE METRICS COLLECTION
// ============================================================================

export async function collectPipelineMetrics(
  pipeline_run_id: string
): Promise<MetricRecord[]> {
  const supabase = supabaseAdmin;
  const metrics: MetricRecord[] = [];
  
  // Collect extraction metrics from AI extraction results
  const { data: extractions } = await supabase
    .from('ai_extraction_results')
    .select('overall_confidence, human_feedback')
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    
  if (extractions && extractions.length > 0) {
    type ExtractionRow = { overall_confidence: number | null; human_feedback: string | null };
    const confirmed = extractions.filter((e: ExtractionRow) => e.human_feedback === 'confirmed').length;
    const corrected = extractions.filter((e: ExtractionRow) => e.human_feedback === 'corrected').length;
    // FIX: Include 'rejected' feedback in total to avoid inflated accuracy
    const rejected = extractions.filter((e: ExtractionRow) => e.human_feedback === 'rejected').length;
    const total = confirmed + corrected + rejected;
    
    if (total > 0) {
      // FIX: Accuracy is confirmed / total (including rejections as failures)
      metrics.push({
        metric_type: 'extraction_accuracy',
        metric_value: confirmed / total,
        sample_size: total,
        pipeline_run_id,
        metadata: { confirmed, corrected, rejected },
      });
      
      metrics.push({
        metric_type: 'operator_correction_rate',
        metric_value: (corrected + rejected) / total, // FIX: corrections + rejections
        sample_size: total,
        pipeline_run_id,
        metadata: { source: 'extraction', corrected, rejected },
      });
    }
    
    const avgConfidence = extractions.reduce(
      (sum: number, e: ExtractionRow) => sum + (e.overall_confidence || 0), 0
    ) / extractions.length;
    
    metrics.push({
      metric_type: 'confidence_calibration',
      metric_value: avgConfidence,
      sample_size: extractions.length,
      pipeline_run_id,
      metadata: { source: 'extraction' },
    });
  }
  
  // Collect matching metrics from AI match reasoning
  const { data: matches } = await supabase
    .from('ai_match_reasoning')
    .select('confidence, hard_constraints_passed, human_decision')
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    
  if (matches && matches.length > 0) {
    type MatchRow = { confidence: number | null; hard_constraints_passed: boolean | null; human_decision: string | null };
    const humanReviewed = matches.filter((m: MatchRow) => m.human_decision);
    const agreed = humanReviewed.filter((m: MatchRow) => 
      m.human_decision === 'approved' || m.human_decision === 'confirmed'
    ).length;
    
    if (humanReviewed.length > 0) {
      metrics.push({
        metric_type: 'match_accuracy',
        metric_value: agreed / humanReviewed.length,
        sample_size: humanReviewed.length,
        pipeline_run_id,
      });
    }
    
    const constraintsPassed = matches.filter((m: MatchRow) => m.hard_constraints_passed).length;
    metrics.push({
      metric_type: 'hard_constraint_accuracy',
      metric_value: constraintsPassed / matches.length,
      sample_size: matches.length,
      pipeline_run_id,
    });
  }
  
  // Collect pricing metrics
  const { data: pricing } = await supabase
    .from('ai_pricing_analysis')
    .select('confidence, action_taken')
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    
  if (pricing && pricing.length > 0) {
    type PricingRow = { confidence: number | null; action_taken: string | null };
    const flagged = pricing.filter((p: PricingRow) => 
      p.action_taken === 'review' || p.action_taken === 'rejected'
    ).length;
    
    metrics.push({
      metric_type: 'pricing_anomaly_precision',
      metric_value: flagged / pricing.length,
      sample_size: pricing.length,
      pipeline_run_id,
    });
  }
  
  // Collect review metrics
  const { data: reviews } = await supabase
    .from('review_queue')
    .select('status')
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    
  // FIX: Use catalogos.supplier_products_normalized for accurate product count
  // The supplier_products table may not exist or have different data
  const { data: allProducts } = await supabase
    .from('supplier_products_normalized')
    .select('id')
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    
  if (reviews && allProducts) {
    const reviewCount = reviews.length;
    const productCount = allProducts.length || 1;
    
    metrics.push({
      metric_type: 'review_rate',
      metric_value: reviewCount / productCount,
      sample_size: productCount,
      pipeline_run_id,
    });
    
    const approved = reviews.filter((r: { status: string | null }) => r.status === 'approved').length;
    metrics.push({
      metric_type: 'auto_approval_rate',
      metric_value: (productCount - reviewCount) / productCount,
      sample_size: productCount,
      pipeline_run_id,
    });
  }
  
  // Collect LLM escalation metrics
  const { data: llmUsage } = await supabase
    .from('ai_llm_usage')
    .select('request_type, tokens_total, cost_estimate')
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    
  if (llmUsage && llmUsage.length > 0 && extractions) {
    metrics.push({
      metric_type: 'llm_escalation_rate',
      metric_value: llmUsage.length / (extractions.length || 1),
      sample_size: extractions.length || 0,
      pipeline_run_id,
    });
  }
  
  return metrics;
}

// ============================================================================
// METRIC RETRIEVAL
// ============================================================================

export async function getAggregatedMetrics(
  days: number = 7
): Promise<AggregatedMetrics> {
  const supabase = supabaseAdmin;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  
  const { data: metrics } = await supabase
    .from('ai_performance_metrics')
    .select('*')
    .gte('created_at', since);
    
  const { data: llmUsage } = await supabase
    .from('ai_llm_usage')
    .select('cost_estimate')
    .gte('created_at', new Date().toISOString().split('T')[0]); // Today only
    
  const byType = new Map<string, { sum: number; count: number; samples: number }>();
  
  for (const m of (metrics || [])) {
    const existing = byType.get(m.metric_type) || { sum: 0, count: 0, samples: 0 };
    existing.sum += Number(m.metric_value);
    existing.count += 1;
    existing.samples += m.sample_size || 0;
    byType.set(m.metric_type, existing);
  }
  
  const getAvg = (type: string) => {
    const entry = byType.get(type);
    return entry ? entry.sum / entry.count : 0;
  };
  
  const getSamples = (type: string) => {
    const entry = byType.get(type);
    return entry ? entry.samples : 0;
  };
  
  const dailyCost = (llmUsage || []).reduce(
    (sum: number, u: { cost_estimate: unknown }) => sum + Number(u.cost_estimate || 0), 0
  );
  
  return {
    extraction: {
      accuracy: getAvg('extraction_accuracy'),
      sample_count: getSamples('extraction_accuracy'),
    },
    matching: {
      accuracy: getAvg('match_accuracy'),
      hard_constraint_accuracy: getAvg('hard_constraint_accuracy'),
      sample_count: getSamples('match_accuracy'),
    },
    pricing: {
      anomaly_precision: getAvg('pricing_anomaly_precision'),
      sample_count: getSamples('pricing_anomaly_precision'),
    },
    review: {
      review_rate: getAvg('review_rate'),
      auto_approval_rate: getAvg('auto_approval_rate'),
      correction_rate: getAvg('operator_correction_rate'),
    },
    llm: {
      escalation_rate: getAvg('llm_escalation_rate'),
      daily_cost: dailyCost,
    },
  };
}

export async function getMetricTrend(
  metric_type: MetricType,
  days: number = 30
): Promise<Array<{ date: string; value: number; samples: number; trend: string }>> {
  const supabase = supabaseAdmin;
  
  const { data, error } = await supabase.rpc('get_ai_performance_trend', {
    p_metric_type: metric_type,
    p_days: days,
  });
  
  if (error || !data) {
    console.error('Failed to get metric trend:', error);
    return [];
  }
  
  return data.map((row: { period_date: string; avg_value: number; sample_count: number; trend_direction: string }) => ({
    date: row.period_date,
    value: Number(row.avg_value),
    samples: row.sample_count,
    trend: row.trend_direction,
  }));
}
