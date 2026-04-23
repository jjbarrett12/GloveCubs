/**
 * Commercial Risk Scoring
 * 
 * Assesses commercial risk for products and supplier relationships.
 * 
 * SAFETY RULES:
 * - Risk scores must be explainable
 * - Require sufficient evidence
 * - Separate low-data uncertainty from true high risk
 * - Do not inflate risk when the issue is simply sparse data
 */

import { supabaseAdmin, getSupabaseCatalogos } from '../jobs/supabase';

// ============================================================================
// TYPES
// ============================================================================

export type RiskBand = 'critical' | 'high' | 'moderate' | 'low';
export type DataQuality = 'strong' | 'sufficient' | 'sparse' | 'insufficient';

export interface CommercialRiskScore {
  entity_type: string;
  entity_id: string;
  risk_score: number;
  risk_band: RiskBand;
  coverage_score: number;
  volatility_score: number;
  trust_score: number;
  acceptance_score: number;
  freshness_score: number;
  depth_score: number;
  reasoning: string;
  evidence: RiskEvidence;
  sample_size: number;
  confidence: number;
  data_quality: DataQuality;
}

export interface RiskEvidence {
  insufficient_data?: boolean;
  data_points_available?: number;
  minimum_required?: number;
  trusted_supplier_count?: number;
  total_supplier_count?: number;
  volatility_band?: string;
  avg_trust_score?: number;
  acceptance_rate?: number;
  override_rate?: number;
  avg_offer_age_days?: number;
  best_offer_changes?: number;
  realized_savings_rate?: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const RISK_CONFIG = {
  // Minimum data requirements
  min_offers_for_coverage: 2,
  min_samples_for_acceptance: 8,   // Increased from 5
  min_factors_for_scoring: 3,      // Need at least 3 factors with real data
  
  // Risk factor weights - rebalanced
  weights: {
    coverage: 0.20,
    volatility: 0.12,             // Reduced from 0.20 - volatility is noisy
    trust: 0.18,                  // Reduced slightly
    acceptance: 0.25,             // Increased from 0.15 - actual operator feedback
    freshness: 0.15,
    depth: 0.10,
  },
  
  // Thresholds
  critical_threshold: 0.75,
  high_threshold: 0.55,           // Increased from 0.50 to reduce false positives
  moderate_threshold: 0.30,       // Increased from 0.25
  
  // Data quality thresholds
  strong_sample_threshold: 25,    // Increased from 20
  sufficient_sample_threshold: 12, // Increased from 10
  sparse_sample_threshold: 6,     // Increased from 5
  
  // Sparse data penalty - reduce risk contribution when data is sparse
  sparse_data_penalty: 0.5,       // Multiply factor contribution by this when sparse
};

// ============================================================================
// MAIN RISK CALCULATION
// ============================================================================

export async function calculateCommercialRiskScores(): Promise<{
  calculated: number;
  by_band: Record<RiskBand, number>;
}> {
  const by_band: Record<RiskBand, number> = {
    critical: 0,
    high: 0,
    moderate: 0,
    low: 0,
  };
  
  let calculated = 0;
  
  // Calculate for products
  const { data: products } = await getSupabaseCatalogos()
    .from('products')
    .select('id')
    .eq('is_active', true)
    .limit(500);
    
  if (products) {
    for (const product of products) {
      const productId = (product as { id: string }).id;
      const risk = await calculateProductRisk(productId);
      
      if (risk.data_quality !== 'insufficient') {
        await persistRiskScore(risk);
        calculated++;
        by_band[risk.risk_band]++;
      }
    }
  }
  
  return { calculated, by_band };
}

// ============================================================================
// PRODUCT RISK CALCULATION
// ============================================================================

async function calculateProductRisk(product_id: string): Promise<CommercialRiskScore> {
  // Collect all risk factors
  const [
    coverageData,
    volatilityData,
    trustData,
    acceptanceData,
    freshnessData,
    depthData,
  ] = await Promise.all([
    calculateCoverageScore(product_id),
    calculateVolatilityRiskScore(product_id),
    calculateTrustRiskScore(product_id),
    calculateAcceptanceRiskScore(product_id),
    calculateFreshnessRiskScore(product_id),
    calculateDepthScore(product_id),
  ]);
  
  // Aggregate sample size
  const sample_size = 
    coverageData.sample_size +
    trustData.sample_size +
    acceptanceData.sample_size +
    freshnessData.sample_size;
    
  // Count factors with real data (not just defaults)
  const factorsWithData = {
    has_coverage: coverageData.sample_size > 0,
    has_trust: trustData.sample_size > 0,
    has_acceptance: acceptanceData.sample_size >= RISK_CONFIG.min_samples_for_acceptance,
    has_freshness: freshnessData.sample_size > 0,
    has_volatility: volatilityData.sample_size > 0,
    has_depth: depthData.sample_size > 0,
  };
  
  const realFactorCount = Object.values(factorsWithData).filter(Boolean).length;
  
  // Determine data quality
  const data_quality = determineDataQuality(sample_size, factorsWithData);
  
  // If insufficient data, return low-confidence result
  if (data_quality === 'insufficient') {
    return createInsufficientDataResult(product_id, sample_size);
  }
  
  // Require minimum factors for meaningful risk scoring
  if (realFactorCount < RISK_CONFIG.min_factors_for_scoring) {
    return {
      ...createInsufficientDataResult(product_id, sample_size),
      data_quality: 'sparse',
      reasoning: `Only ${realFactorCount} risk factors have sufficient data (need ${RISK_CONFIG.min_factors_for_scoring})`,
    };
  }
  
  // Calculate weighted risk score with sparse-data penalties
  // Higher values = higher risk
  // Apply penalty when factor has no/sparse data - use neutral 0.5 contribution instead
  const getSparseAdjustedContribution = (
    score: number, 
    hasData: boolean, 
    weight: number,
    invertScore: boolean = false
  ): number => {
    const effectiveScore = invertScore ? (1 - score) : score;
    if (!hasData) {
      // No data: use neutral contribution (0.5) with penalty
      return 0.5 * weight * RISK_CONFIG.sparse_data_penalty;
    }
    return effectiveScore * weight;
  };
  
  const risk_score = 
    getSparseAdjustedContribution(coverageData.score, factorsWithData.has_coverage, RISK_CONFIG.weights.coverage, true) +
    getSparseAdjustedContribution(volatilityData.score, factorsWithData.has_volatility, RISK_CONFIG.weights.volatility, false) +
    getSparseAdjustedContribution(trustData.score, factorsWithData.has_trust, RISK_CONFIG.weights.trust, true) +
    getSparseAdjustedContribution(acceptanceData.score, factorsWithData.has_acceptance, RISK_CONFIG.weights.acceptance, true) +
    getSparseAdjustedContribution(freshnessData.score, factorsWithData.has_freshness, RISK_CONFIG.weights.freshness, true) +
    getSparseAdjustedContribution(depthData.score, factorsWithData.has_depth, RISK_CONFIG.weights.depth, true);
    
  // Determine band
  const risk_band = determineRiskBand(risk_score);
  
  // Calculate confidence
  const confidence = calculateConfidence(sample_size, data_quality);
  
  // Generate reasoning
  const reasoning = generateRiskReasoning({
    coverage: coverageData,
    volatility: volatilityData,
    trust: trustData,
    acceptance: acceptanceData,
    freshness: freshnessData,
    depth: depthData,
    risk_band,
  });
  
  return {
    entity_type: 'product',
    entity_id: product_id,
    risk_score,
    risk_band,
    coverage_score: coverageData.score,
    volatility_score: volatilityData.score,
    trust_score: trustData.score,
    acceptance_score: acceptanceData.score,
    freshness_score: freshnessData.score,
    depth_score: depthData.score,
    reasoning,
    evidence: {
      trusted_supplier_count: coverageData.trusted_count,
      total_supplier_count: coverageData.total_count,
      volatility_band: volatilityData.band,
      avg_trust_score: trustData.avg_score,
      acceptance_rate: acceptanceData.rate,
      override_rate: acceptanceData.override_rate,
      avg_offer_age_days: freshnessData.avg_age_days,
      best_offer_changes: volatilityData.change_count,
    },
    sample_size,
    confidence,
    data_quality,
  };
}

// ============================================================================
// INDIVIDUAL RISK FACTORS
// ============================================================================

interface FactorResult {
  score: number;
  sample_size: number;
  [key: string]: unknown;
}

async function calculateCoverageScore(product_id: string): Promise<FactorResult & {
  trusted_count: number;
  total_count: number;
}> {
  // Count trusted suppliers for this product
  const { data: offers } = await supabaseAdmin
    .from('supplier_offers')
    .select('supplier_id')
    .eq('product_id', product_id)
    .eq('is_active', true);
    
  if (!offers || offers.length === 0) {
    return { score: 0, sample_size: 0, trusted_count: 0, total_count: 0 };
  }
  
  const supplierIds = Array.from(new Set(offers.map(o => o.supplier_id)));
  
  // Get trust scores for these suppliers
  const { data: trustScores } = await supabaseAdmin
    .from('offer_trust_scores')
    .select('supplier_id, trust_band')
    .eq('product_id', product_id)
    .in('trust_band', ['high_trust', 'medium_trust']);
    
  const trustedSuppliers = new Set(trustScores?.map(t => t.supplier_id) || []);
  
  const trusted_count = trustedSuppliers.size;
  const total_count = supplierIds.length;
  
  // Score: 1.0 if 3+ trusted suppliers, scales down
  const score = Math.min(1, trusted_count / 3);
  
  return {
    score,
    sample_size: offers.length,
    trusted_count,
    total_count,
  };
}

async function calculateVolatilityRiskScore(product_id: string): Promise<FactorResult & {
  band: string;
  change_count: number;
}> {
  // Get recent volatility forecasts for smoothing (last 3)
  const { data: forecasts } = await supabaseAdmin
    .from('price_volatility_forecasts')
    .select('volatility_score, volatility_band, confidence')
    .eq('product_id', product_id)
    .order('forecast_as_of', { ascending: false })
    .limit(3);
    
  if (!forecasts || forecasts.length === 0) {
    return { score: 0, sample_size: 0, band: 'unknown', change_count: 0 };
  }
  
  // Calculate smoothed volatility score (weighted average, recent weighted higher)
  // This prevents a single noisy forecast from spiking the risk score
  const weights = [0.5, 0.3, 0.2]; // Most recent gets highest weight
  let weightedSum = 0;
  let totalWeight = 0;
  
  for (let i = 0; i < forecasts.length; i++) {
    const weight = weights[i] || 0.1;
    const confidence = Number(forecasts[i].confidence) || 0.5;
    const effectiveWeight = weight * confidence;
    weightedSum += Number(forecasts[i].volatility_score) * effectiveWeight;
    totalWeight += effectiveWeight;
  }
  
  const smoothedScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const latestBand = forecasts[0].volatility_band;
  
  // Count best-offer changes
  const { data: changes } = await supabaseAdmin
    .from('supplier_recommendations')
    .select('supplier_id')
    .eq('product_id', product_id)
    .eq('recommended_rank', 1)
    .gte('calculated_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
    
  const uniqueSuppliers = new Set(changes?.map(c => c.supplier_id) || []);
  const change_count = Math.max(0, uniqueSuppliers.size - 1);
  
  return {
    score: smoothedScore,
    sample_size: forecasts.length,
    band: latestBand,
    change_count,
  };
}

async function calculateTrustRiskScore(product_id: string): Promise<FactorResult & {
  avg_score: number;
}> {
  const { data: trustScores } = await supabaseAdmin
    .from('offer_trust_scores')
    .select('trust_score')
    .eq('product_id', product_id)
    .gte('calculated_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
    
  if (!trustScores || trustScores.length === 0) {
    return { score: 0.5, sample_size: 0, avg_score: 0.5 };
  }
  
  const avg_score = trustScores.reduce((sum, t) => sum + Number(t.trust_score), 0) / trustScores.length;
  
  return {
    score: avg_score,
    sample_size: trustScores.length,
    avg_score,
  };
}

async function calculateAcceptanceRiskScore(product_id: string): Promise<FactorResult & {
  rate: number;
  override_rate: number;
}> {
  const { data: outcomes } = await supabaseAdmin
    .from('recommendation_outcomes')
    .select('outcome_status, selected_supplier_id, supplier_id')
    .eq('product_id', product_id)
    .in('outcome_status', ['accepted', 'rejected'])
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
    
  if (!outcomes || outcomes.length < RISK_CONFIG.min_samples_for_acceptance) {
    return { score: 0.5, sample_size: outcomes?.length || 0, rate: 0.5, override_rate: 0 };
  }
  
  const accepted = outcomes.filter(o => o.outcome_status === 'accepted').length;
  const overridden = outcomes.filter(o => 
    o.outcome_status === 'accepted' && 
    o.selected_supplier_id && 
    o.selected_supplier_id !== o.supplier_id
  ).length;
  
  const rate = accepted / outcomes.length;
  const override_rate = overridden / outcomes.length;
  
  return {
    score: rate,
    sample_size: outcomes.length,
    rate,
    override_rate,
  };
}

async function calculateFreshnessRiskScore(product_id: string): Promise<FactorResult & {
  avg_age_days: number;
}> {
  const { data: offers } = await supabaseAdmin
    .from('supplier_offers')
    .select('updated_at')
    .eq('product_id', product_id)
    .eq('is_active', true);
    
  if (!offers || offers.length === 0) {
    return { score: 0, sample_size: 0, avg_age_days: 999 };
  }
  
  const now = Date.now();
  const ages = offers.map(o => {
    const age = (now - new Date(o.updated_at).getTime()) / (24 * 60 * 60 * 1000);
    return age;
  });
  
  const avg_age_days = ages.reduce((a, b) => a + b, 0) / ages.length;
  
  // Score: 1.0 if <7 days old, 0 if >60 days
  const score = Math.max(0, 1 - (avg_age_days / 60));
  
  return {
    score,
    sample_size: offers.length,
    avg_age_days,
  };
}

async function calculateDepthScore(product_id: string): Promise<FactorResult> {
  const { data: offers } = await supabaseAdmin
    .from('supplier_offers')
    .select('supplier_id')
    .eq('product_id', product_id)
    .eq('is_active', true);
    
  if (!offers) {
    return { score: 0, sample_size: 0 };
  }
  
  const uniqueSuppliers = new Set(offers.map(o => o.supplier_id)).size;
  
  // Score: 1.0 if 5+ suppliers, scales down
  const score = Math.min(1, uniqueSuppliers / 5);
  
  return {
    score,
    sample_size: offers.length,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function determineDataQuality(
  sample_size: number,
  factors: Record<string, boolean>
): DataQuality {
  const factorCount = Object.values(factors).filter(Boolean).length;
  
  // Need at least 2 factors and minimum samples
  if (factorCount < 2 || sample_size < RISK_CONFIG.sparse_sample_threshold) {
    return 'insufficient';
  }
  
  // Strong: lots of samples AND most factors present
  if (sample_size >= RISK_CONFIG.strong_sample_threshold && factorCount >= 5) {
    return 'strong';
  }
  
  // Sufficient: good samples AND reasonable factor coverage
  if (sample_size >= RISK_CONFIG.sufficient_sample_threshold && factorCount >= 3) {
    return 'sufficient';
  }
  
  // Sparse: we have some data but it's thin
  return 'sparse';
}

function determineRiskBand(risk_score: number): RiskBand {
  if (risk_score >= RISK_CONFIG.critical_threshold) return 'critical';
  if (risk_score >= RISK_CONFIG.high_threshold) return 'high';
  if (risk_score >= RISK_CONFIG.moderate_threshold) return 'moderate';
  return 'low';
}

function calculateConfidence(sample_size: number, data_quality: DataQuality): number {
  const qualityMultiplier: Record<DataQuality, number> = {
    strong: 1.0,
    sufficient: 0.8,
    sparse: 0.5,
    insufficient: 0.2,
  };
  
  const sampleFactor = Math.min(1, sample_size / RISK_CONFIG.strong_sample_threshold);
  
  return sampleFactor * qualityMultiplier[data_quality];
}

function generateRiskReasoning(data: {
  coverage: FactorResult;
  volatility: FactorResult;
  trust: FactorResult;
  acceptance: FactorResult;
  freshness: FactorResult;
  depth: FactorResult;
  risk_band: RiskBand;
}): string {
  const issues: string[] = [];
  
  if (data.coverage.score < 0.5) {
    issues.push(`limited trusted supplier coverage (${(data.coverage as FactorResult & { trusted_count: number }).trusted_count} trusted)`);
  }
  
  if (data.volatility.score > 0.5) {
    issues.push(`elevated price volatility`);
  }
  
  if (data.trust.score < 0.6) {
    issues.push(`low average trust (${((data.trust as FactorResult & { avg_score: number }).avg_score * 100).toFixed(0)}%)`);
  }
  
  if ((data.acceptance as FactorResult & { rate: number }).rate < 0.5) {
    issues.push(`poor recommendation acceptance (${((data.acceptance as FactorResult & { rate: number }).rate * 100).toFixed(0)}%)`);
  }
  
  if (data.freshness.score < 0.5) {
    issues.push(`stale pricing data (avg ${((data.freshness as FactorResult & { avg_age_days: number }).avg_age_days).toFixed(0)} days old)`);
  }
  
  if (data.depth.score < 0.4) {
    issues.push(`limited competitive depth`);
  }
  
  if (issues.length === 0) {
    return 'No significant commercial risk factors identified';
  }
  
  return `Risk factors: ${issues.join('; ')}`;
}

function createInsufficientDataResult(
  product_id: string,
  sample_size: number
): CommercialRiskScore {
  return {
    entity_type: 'product',
    entity_id: product_id,
    risk_score: -1,  // Use -1 to indicate "unknown" rather than 0 (which implies low risk)
    risk_band: 'low', // DB constraint requires valid band, but confidence=0 indicates uncertainty
    coverage_score: 0,
    volatility_score: 0,
    trust_score: 0,
    acceptance_score: 0,
    freshness_score: 0,
    depth_score: 0,
    reasoning: `Insufficient data for risk assessment (${sample_size} data points) - risk level UNKNOWN`,
    evidence: {
      insufficient_data: true,
      data_points_available: sample_size,
      minimum_required: RISK_CONFIG.sparse_sample_threshold,
    },
    sample_size,
    confidence: 0,  // Zero confidence means "we don't know"
    data_quality: 'insufficient',
  };
}

// ============================================================================
// PERSISTENCE
// ============================================================================

async function persistRiskScore(risk: CommercialRiskScore): Promise<void> {
  await supabaseAdmin
    .from('commercial_risk_scores')
    .insert({
      entity_type: risk.entity_type,
      entity_id: risk.entity_id,
      risk_score: risk.risk_score,
      risk_band: risk.risk_band,
      coverage_score: risk.coverage_score,
      volatility_score: risk.volatility_score,
      trust_score: risk.trust_score,
      acceptance_score: risk.acceptance_score,
      freshness_score: risk.freshness_score,
      depth_score: risk.depth_score,
      reasoning: risk.reasoning,
      evidence: risk.evidence,
      sample_size: risk.sample_size,
      confidence: risk.confidence,
      data_quality: risk.data_quality,
      calculated_at: new Date().toISOString(),
    });
}

// ============================================================================
// RETRIEVAL
// ============================================================================

export async function getCommercialRiskLeaderboard(
  limit: number = 20
): Promise<CommercialRiskScore[]> {
  const { data } = await supabaseAdmin
    .from('commercial_risk_leaderboard')
    .select('*')
    .limit(limit);
    
  if (!data) return [];
  
  return data.map(d => ({
    entity_type: d.entity_type,
    entity_id: d.entity_id,
    risk_score: Number(d.risk_score),
    risk_band: d.risk_band as RiskBand,
    coverage_score: Number(d.coverage_score),
    volatility_score: Number(d.volatility_score),
    trust_score: Number(d.trust_score),
    acceptance_score: 0,
    freshness_score: Number(d.freshness_score),
    depth_score: 0,
    reasoning: d.reasoning,
    evidence: {},
    sample_size: d.sample_size,
    confidence: Number(d.confidence),
    data_quality: d.data_quality as DataQuality,
  }));
}

export async function getWeaklyCoveredProducts(limit: number = 20): Promise<CommercialRiskScore[]> {
  const { data } = await supabaseAdmin
    .from('weakly_covered_products')
    .select('*')
    .limit(limit);
    
  if (!data) return [];
  
  return data.map(d => ({
    entity_type: 'product',
    entity_id: d.product_id,
    risk_score: Number(d.risk_score),
    risk_band: d.risk_band as RiskBand,
    coverage_score: Number(d.coverage_score),
    volatility_score: 0,
    trust_score: Number(d.trust_score),
    acceptance_score: 0,
    freshness_score: 0,
    depth_score: Number(d.depth_score),
    reasoning: d.reasoning,
    evidence: {},
    sample_size: d.sample_size,
    confidence: 0,
    data_quality: 'sufficient',
  }));
}

export async function getProductRisk(product_id: string): Promise<CommercialRiskScore | null> {
  const { data } = await supabaseAdmin
    .from('commercial_risk_scores')
    .select('*')
    .eq('entity_type', 'product')
    .eq('entity_id', product_id)
    .order('calculated_at', { ascending: false })
    .limit(1)
    .single();
    
  if (!data) return null;
  
  return {
    entity_type: data.entity_type,
    entity_id: data.entity_id,
    risk_score: Number(data.risk_score),
    risk_band: data.risk_band as RiskBand,
    coverage_score: Number(data.coverage_score),
    volatility_score: Number(data.volatility_score),
    trust_score: Number(data.trust_score),
    acceptance_score: Number(data.acceptance_score),
    freshness_score: Number(data.freshness_score),
    depth_score: Number(data.depth_score),
    reasoning: data.reasoning,
    evidence: data.evidence as RiskEvidence,
    sample_size: data.sample_size,
    confidence: Number(data.confidence),
    data_quality: data.data_quality as DataQuality,
  };
}
