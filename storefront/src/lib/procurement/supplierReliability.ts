/**
 * Supplier Reliability Scoring
 * 
 * Calculates and persists supplier reliability based on:
 * - feed completeness
 * - feed consistency over time
 * - product attribute accuracy
 * - price update freshness
 * - anomaly frequency
 * - review correction rate
 * - duplicate/error frequency
 * - operator override frequency
 */

import { supabaseAdmin } from '../jobs/supabase';

// ============================================================================
// TYPES
// ============================================================================

export type ReliabilityBand = 'trusted' | 'stable' | 'watch' | 'risky';

export interface SupplierReliabilityFactors {
  completeness: number;      // 0-1: How complete are their feeds?
  freshness: number;         // 0-1: How fresh is their pricing data?
  accuracy: number;          // 0-1: How accurate are extractions?
  stability: number;         // 0-1: How consistent over time?
  anomaly_rate: number;      // 0-1: Penalty for anomalies
  override_rate: number;     // 0-1: Penalty for operator overrides
  error_rate: number;        // 0-1: Penalty for errors/duplicates
  correction_rate: number;   // 0-1: Penalty for human corrections
}

export interface SupplierReliabilityScore {
  supplier_id: string;
  reliability_score: number;
  reliability_band: ReliabilityBand;
  completeness_score: number;
  freshness_score: number;
  accuracy_score: number;
  stability_score: number;
  override_penalty: number;
  anomaly_penalty: number;
  sample_size: number;
  factors: SupplierReliabilityFactors;
}

// ============================================================================
// SCORING WEIGHTS
// ============================================================================

const RELIABILITY_WEIGHTS = {
  completeness: 0.15,
  freshness: 0.20,
  accuracy: 0.20,
  stability: 0.10,
  anomaly_penalty: 0.15,     // Increased: anomalies are serious
  override_penalty: 0.10,    // Increased: overrides indicate trust issues
  error_penalty: 0.05,
  correction_penalty: 0.10,  // Increased: high corrections = unreliable data
};

// Minimum sample size for reliable scoring
const MIN_SAMPLE_SIZE_FOR_SCORING = 20;
const MIN_SAMPLE_SIZE_FOR_TRUSTED = 50;
const MIN_EXTRACTION_SAMPLES = 10;

// ============================================================================
// BAND THRESHOLDS
// ============================================================================

function determineReliabilityBand(score: number, sampleSize: number): ReliabilityBand {
  // Cannot be "trusted" without sufficient sample size
  if (sampleSize < MIN_SAMPLE_SIZE_FOR_TRUSTED) {
    if (score >= 0.70) return 'stable';
    if (score >= 0.50) return 'watch';
    return 'risky';
  }
  
  if (score >= 0.85) return 'trusted';
  if (score >= 0.70) return 'stable';
  if (score >= 0.50) return 'watch';
  return 'risky';
}

// ============================================================================
// MAIN SCORING FUNCTION
// ============================================================================

export async function calculateSupplierReliabilityScore(
  supplier_id: string
): Promise<SupplierReliabilityScore> {
  // Get sample size first - needed for score adjustment
  const sample_size = await getSupplierSampleSize(supplier_id);
  
  // Collect all factors
  const factors = await collectSupplierFactors(supplier_id);
  
  // Calculate weighted score
  const positiveScore = 
    factors.completeness * RELIABILITY_WEIGHTS.completeness +
    factors.freshness * RELIABILITY_WEIGHTS.freshness +
    factors.accuracy * RELIABILITY_WEIGHTS.accuracy +
    factors.stability * RELIABILITY_WEIGHTS.stability;
    
  const penalties = 
    factors.anomaly_rate * RELIABILITY_WEIGHTS.anomaly_penalty +
    factors.override_rate * RELIABILITY_WEIGHTS.override_penalty +
    factors.error_rate * RELIABILITY_WEIGHTS.error_penalty +
    factors.correction_rate * RELIABILITY_WEIGHTS.correction_penalty;
    
  let reliability_score = Math.max(0, Math.min(1, positiveScore - penalties));
  
  // Apply small sample size penalty - uncertainty discount
  if (sample_size < MIN_SAMPLE_SIZE_FOR_SCORING) {
    // Reduce score towards 0.5 (neutral) for very small samples
    const confidence_factor = sample_size / MIN_SAMPLE_SIZE_FOR_SCORING;
    reliability_score = 0.5 + (reliability_score - 0.5) * confidence_factor;
  }
  
  const reliability_band = determineReliabilityBand(reliability_score, sample_size);
  
  const result: SupplierReliabilityScore = {
    supplier_id,
    reliability_score,
    reliability_band,
    completeness_score: factors.completeness,
    freshness_score: factors.freshness,
    accuracy_score: factors.accuracy,
    stability_score: factors.stability,
    override_penalty: factors.override_rate,
    anomaly_penalty: factors.anomaly_rate,
    sample_size,
    factors,
  };
  
  // Persist the score
  await persistSupplierReliabilityScore(result);
  
  return result;
}

// ============================================================================
// FACTOR COLLECTION
// ============================================================================

async function collectSupplierFactors(
  supplier_id: string
): Promise<SupplierReliabilityFactors> {
  const [
    completeness,
    freshness,
    accuracy,
    stability,
    anomaly_rate,
    override_rate,
    error_rate,
    correction_rate,
  ] = await Promise.all([
    calculateCompleteness(supplier_id),
    calculateFreshness(supplier_id),
    calculateAccuracy(supplier_id),
    calculateStability(supplier_id),
    calculateAnomalyRate(supplier_id),
    calculateOverrideRate(supplier_id),
    calculateErrorRate(supplier_id),
    calculateCorrectionRate(supplier_id),
  ]);
  
  return {
    completeness,
    freshness,
    accuracy,
    stability,
    anomaly_rate,
    override_rate,
    error_rate,
    correction_rate,
  };
}

async function calculateCompleteness(supplier_id: string): Promise<number> {
  // Check how complete supplier products are (required fields populated)
  const { data: products } = await supabaseAdmin
    .from('supplier_products')
    .select('material, size, brand, units_per_box, supplier_sku')
    .eq('supplier_id', supplier_id)
    .limit(100);
    
  // No data = low confidence, not neutral
  if (!products || products.length === 0) return 0.3;
  
  const requiredFields = ['material', 'size', 'units_per_box', 'supplier_sku'];
  let totalScore = 0;
  
  for (const product of products) {
    const p = product as Record<string, unknown>;
    const filledFields = requiredFields.filter(f => p[f] != null && p[f] !== '');
    totalScore += filledFields.length / requiredFields.length;
  }
  
  return totalScore / products.length;
}

async function calculateFreshness(supplier_id: string): Promise<number> {
  // Check how recent the last price updates are
  const { data: offers } = await supabaseAdmin
    .from('supplier_offers')
    .select('updated_at')
    .eq('supplier_id', supplier_id)
    .eq('is_active', true)
    .limit(100);
    
  // No offers = very low freshness (stale/inactive supplier)
  if (!offers || offers.length === 0) return 0.2;
  
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  let totalScore = 0;
  
  for (const offer of offers) {
    const o = offer as { updated_at: string };
    const ageMs = now - new Date(o.updated_at).getTime();
    const ageDays = ageMs / oneDayMs;
    
    // Stricter freshness scoring - stale data is penalized more heavily
    if (ageDays < 1) totalScore += 1.0;
    else if (ageDays < 3) totalScore += 0.9;
    else if (ageDays < 7) totalScore += 0.7;
    else if (ageDays < 14) totalScore += 0.4;
    else if (ageDays < 30) totalScore += 0.2;
    else totalScore += 0.05;  // Very stale = near-zero contribution
  }
  
  return totalScore / offers.length;
}

async function calculateAccuracy(supplier_id: string): Promise<number> {
  // Check extraction confidence for this supplier's products
  const { data: extractions } = await supabaseAdmin
    .from('ai_extraction_results')
    .select('overall_confidence, human_feedback')
    .eq('supplier_id', supplier_id)
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .limit(100);
    
  // No extraction data = unproven accuracy, not assumed good
  if (!extractions || extractions.length === 0) return 0.4;
  
  // Very small sample = low confidence in the accuracy measure itself
  if (extractions.length < MIN_EXTRACTION_SAMPLES) {
    // Cap at 0.6 for small samples - can't claim high accuracy without proof
    const maxScore = 0.6;
    return Math.min(maxScore, calculateAccuracyFromSamples(extractions));
  }
  
  return calculateAccuracyFromSamples(extractions);
}

function calculateAccuracyFromSamples(
  extractions: Array<{ overall_confidence: number | null; human_feedback: string | null }>
): number {
  let totalConfidence = 0;
  let confirmedCount = 0;
  let rejectedCount = 0;
  
  for (const ext of extractions) {
    const e = ext as { overall_confidence: number | null; human_feedback: string | null };
    totalConfidence += e.overall_confidence || 0.5;
    if (e.human_feedback === 'confirmed') confirmedCount++;
    if (e.human_feedback === 'rejected') rejectedCount++;
  }
  
  const avgConfidence = totalConfidence / extractions.length;
  
  // Include rejection rate as a negative signal
  const feedbackedCount = confirmedCount + rejectedCount;
  const confirmationRate = feedbackedCount > 0 
    ? confirmedCount / feedbackedCount 
    : 0.5;  // No feedback = neutral
  
  // Weighted: 50% confidence, 50% confirmation rate (feedback matters more)
  return avgConfidence * 0.5 + confirmationRate * 0.5;
}

async function calculateStability(supplier_id: string): Promise<number> {
  // Check price stability over time (fewer dramatic swings = more stable)
  const { data: history } = await supabaseAdmin
    .from('price_history')
    .select('price, recorded_at')
    .eq('supplier_id', supplier_id)
    .gte('recorded_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .order('recorded_at', { ascending: true })
    .limit(200);
    
  // Not enough data = unproven stability (neutral-low)
  if (!history || history.length < 2) return 0.5;
  
  let totalSwing = 0;
  let swingCount = 0;
  
  for (let i = 1; i < history.length; i++) {
    const prev = (history[i-1] as { price: number }).price;
    const curr = (history[i] as { price: number }).price;
    if (prev > 0) {
      const percentChange = Math.abs(curr - prev) / prev;
      totalSwing += percentChange;
      swingCount++;
    }
  }
  
  if (swingCount === 0) return 0.6;  // No price changes = slightly above neutral
  
  const avgSwing = totalSwing / swingCount;
  // Lower swing = higher stability
  // 0% swing = 1.0, 5% avg swing = 0.7, 10% avg swing = 0.4, 20%+ avg swing = 0.1
  return Math.max(0.1, 1 - avgSwing * 6);
}

async function calculateAnomalyRate(supplier_id: string): Promise<number> {
  // Check pricing anomaly frequency
  const { data: analyses } = await supabaseAdmin
    .from('ai_pricing_analysis')
    .select('is_suspicious')
    .eq('supplier_id', supplier_id)
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .limit(100);
    
  if (!analyses || analyses.length === 0) return 0; // No anomalies = no penalty
  
  const suspicious = analyses.filter((a: { is_suspicious: boolean }) => a.is_suspicious).length;
  return suspicious / analyses.length;
}

async function calculateOverrideRate(supplier_id: string): Promise<number> {
  // Check how often operators override AI recommendations for this supplier
  const { data: feedback } = await supabaseAdmin
    .from('ai_feedback')
    .select('was_correct')
    .eq('source_table', 'supplier_products')
    .gte('corrected_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .limit(100);
    
  // Filter by supplier from source_id (would need join in real implementation)
  if (!feedback || feedback.length === 0) return 0;
  
  const overridden = feedback.filter((f: { was_correct: boolean }) => !f.was_correct).length;
  return overridden / feedback.length;
}

async function calculateErrorRate(supplier_id: string): Promise<number> {
  // Check error/failure rate in jobs for this supplier
  const { data: jobs } = await supabaseAdmin
    .from('job_runs')
    .select('status')
    .eq('job_type', 'supplier_ingestion')
    .gte('started_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .limit(50);
    
  if (!jobs || jobs.length === 0) return 0;
  
  const failed = jobs.filter((j: { status: string }) => j.status === 'failed').length;
  return failed / jobs.length;
}

async function calculateCorrectionRate(supplier_id: string): Promise<number> {
  // Check human correction rate for this supplier
  const { data: reviews } = await supabaseAdmin
    .from('review_queue')
    .select('status')
    .eq('source_table', 'supplier_products')
    .in('status', ['approved', 'rejected', 'resolved'])
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .limit(100);
    
  if (!reviews || reviews.length === 0) return 0;
  
  // Consider rejected as needing correction
  const corrected = reviews.filter((r: { status: string }) => r.status === 'rejected').length;
  return corrected / reviews.length;
}

async function getSupplierSampleSize(supplier_id: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from('supplier_products')
    .select('*', { count: 'exact', head: true })
    .eq('supplier_id', supplier_id);
    
  return count || 0;
}

// ============================================================================
// PERSISTENCE
// ============================================================================

async function persistSupplierReliabilityScore(
  score: SupplierReliabilityScore
): Promise<void> {
  await supabaseAdmin
    .from('supplier_reliability_scores')
    .insert({
      supplier_id: score.supplier_id,
      reliability_score: score.reliability_score,
      reliability_band: score.reliability_band,
      completeness_score: score.completeness_score,
      freshness_score: score.freshness_score,
      accuracy_score: score.accuracy_score,
      stability_score: score.stability_score,
      override_penalty: score.override_penalty,
      anomaly_penalty: score.anomaly_penalty,
      sample_size: score.sample_size,
      factors: score.factors,
      calculated_at: new Date().toISOString(),
    });
}

// ============================================================================
// BATCH CALCULATION
// ============================================================================

export async function calculateAllSupplierReliabilityScores(): Promise<{
  calculated: number;
  errors: number;
}> {
  // Get all active suppliers
  const { data: suppliers } = await supabaseAdmin
    .from('suppliers')
    .select('id')
    .eq('is_active', true);
    
  if (!suppliers) return { calculated: 0, errors: 0 };
  
  let calculated = 0;
  let errors = 0;
  
  for (const supplier of suppliers) {
    try {
      const s = supplier as { id: string };
      await calculateSupplierReliabilityScore(s.id);
      calculated++;
    } catch (error) {
      console.error('Failed to calculate supplier reliability:', error);
      errors++;
    }
  }
  
  return { calculated, errors };
}

// ============================================================================
// RETRIEVAL
// ============================================================================

export async function getSupplierReliability(
  supplier_id: string
): Promise<SupplierReliabilityScore | null> {
  const { data } = await supabaseAdmin
    .from('supplier_reliability_scores')
    .select('*')
    .eq('supplier_id', supplier_id)
    .order('calculated_at', { ascending: false })
    .limit(1)
    .single();
    
  if (!data) return null;
  
  return {
    supplier_id: data.supplier_id,
    reliability_score: Number(data.reliability_score),
    reliability_band: data.reliability_band as ReliabilityBand,
    completeness_score: Number(data.completeness_score),
    freshness_score: Number(data.freshness_score),
    accuracy_score: Number(data.accuracy_score),
    stability_score: Number(data.stability_score),
    override_penalty: Number(data.override_penalty),
    anomaly_penalty: Number(data.anomaly_penalty),
    sample_size: data.sample_size,
    factors: data.factors as SupplierReliabilityFactors,
  };
}

export async function getReliabilityLeaderboard(
  limit: number = 20
): Promise<Array<SupplierReliabilityScore & { rank: number }>> {
  const { data } = await supabaseAdmin
    .from('supplier_reliability_leaderboard')
    .select('*')
    .limit(limit);
    
  if (!data) return [];
  
  return data.map((d, i) => ({
    supplier_id: d.supplier_id,
    reliability_score: Number(d.reliability_score),
    reliability_band: d.reliability_band as ReliabilityBand,
    completeness_score: Number(d.completeness_score),
    freshness_score: Number(d.freshness_score),
    accuracy_score: Number(d.accuracy_score),
    stability_score: Number(d.stability_score),
    override_penalty: 0,
    anomaly_penalty: 0,
    sample_size: d.sample_size,
    factors: {} as SupplierReliabilityFactors,
    rank: i + 1,
  }));
}

export async function getRiskySuppliers(): Promise<SupplierReliabilityScore[]> {
  const { data } = await supabaseAdmin
    .from('supplier_reliability_leaderboard')
    .select('*')
    .in('reliability_band', ['watch', 'risky'])
    .order('reliability_score', { ascending: true })
    .limit(20);
    
  if (!data) return [];
  
  return data.map(d => ({
    supplier_id: d.supplier_id,
    reliability_score: Number(d.reliability_score),
    reliability_band: d.reliability_band as ReliabilityBand,
    completeness_score: Number(d.completeness_score),
    freshness_score: Number(d.freshness_score),
    accuracy_score: Number(d.accuracy_score),
    stability_score: Number(d.stability_score),
    override_penalty: 0,
    anomaly_penalty: 0,
    sample_size: d.sample_size,
    factors: {} as SupplierReliabilityFactors,
  }));
}
