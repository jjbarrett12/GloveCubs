/**
 * Offer Trust Scoring
 * 
 * Calculates trust scores for supplier offers based on:
 * - supplier reliability
 * - matching confidence
 * - extraction confidence
 * - freshness
 * - anomaly history
 * - pack normalization certainty
 * - prior human correction history
 */

import { supabaseAdmin } from '../jobs/supabase';
import { getSupplierReliability } from './supplierReliability';

// ============================================================================
// TYPES
// ============================================================================

export type TrustBand = 'high_trust' | 'medium_trust' | 'review_sensitive' | 'low_trust';

export interface OfferTrustFactors {
  supplier_reliability: number;
  match_confidence: number;
  extraction_confidence: number;
  pricing_confidence: number;
  freshness: number;
  normalization_confidence: number;
  anomaly_history: number;
  correction_history: number;
}

export interface OfferTrustScore {
  offer_id: string;
  supplier_id: string;
  product_id?: string;
  trust_score: number;
  trust_band: TrustBand;
  supplier_reliability_score: number;
  match_confidence: number;
  pricing_confidence: number;
  freshness_score: number;
  normalization_confidence: number;
  anomaly_penalty: number;
  override_penalty: number;
  factors: OfferTrustFactors;
}

// ============================================================================
// SCORING WEIGHTS
// ============================================================================

const TRUST_WEIGHTS = {
  supplier_reliability: 0.25,
  match_confidence: 0.18,
  extraction_confidence: 0.12,
  pricing_confidence: 0.12,
  freshness: 0.08,
  normalization_confidence: 0.10,
  anomaly_penalty: 0.10,    // Increased: anomalies are serious trust violations
  correction_penalty: 0.05, // Increased: corrections indicate data issues
};

// Minimum freshness days before severe penalty
const STALE_OFFER_THRESHOLD_DAYS = 14;
const VERY_STALE_THRESHOLD_DAYS = 30;

// ============================================================================
// BAND THRESHOLDS
// ============================================================================

function determineTrustBand(
  score: number, 
  factors: OfferTrustFactors
): TrustBand {
  // Hard overrides: certain conditions force lower trust regardless of score
  if (factors.anomaly_history > 0.5) return 'low_trust';
  if (factors.correction_history > 0.3) return 'review_sensitive';
  if (factors.normalization_confidence < 0.3) return 'review_sensitive';
  
  if (score >= 0.80) return 'high_trust';
  if (score >= 0.60) return 'medium_trust';
  if (score >= 0.40) return 'review_sensitive';
  return 'low_trust';
}

// ============================================================================
// MAIN SCORING FUNCTION
// ============================================================================

export async function calculateOfferTrustScore(
  offer_id: string
): Promise<OfferTrustScore> {
  // Load offer details
  const { data: offer } = await supabaseAdmin
    .from('supplier_offers')
    .select('supplier_id, product_id, updated_at')
    .eq('id', offer_id)
    .single();
    
  if (!offer) {
    throw new Error(`Offer not found: ${offer_id}`);
  }
  
  const o = offer as { supplier_id: string; product_id: string | null; updated_at: string };
  
  // Collect all factors
  const factors = await collectOfferFactors(offer_id, o.supplier_id, o.product_id || undefined);
  
  // Calculate weighted score
  const positiveScore = 
    factors.supplier_reliability * TRUST_WEIGHTS.supplier_reliability +
    factors.match_confidence * TRUST_WEIGHTS.match_confidence +
    factors.extraction_confidence * TRUST_WEIGHTS.extraction_confidence +
    factors.pricing_confidence * TRUST_WEIGHTS.pricing_confidence +
    factors.freshness * TRUST_WEIGHTS.freshness +
    factors.normalization_confidence * TRUST_WEIGHTS.normalization_confidence;
    
  const penalties = 
    factors.anomaly_history * TRUST_WEIGHTS.anomaly_penalty +
    factors.correction_history * TRUST_WEIGHTS.correction_penalty;
    
  const trust_score = Math.max(0, Math.min(1, positiveScore - penalties));
  const trust_band = determineTrustBand(trust_score, factors);
  
  const result: OfferTrustScore = {
    offer_id,
    supplier_id: o.supplier_id,
    product_id: o.product_id || undefined,
    trust_score,
    trust_band,
    supplier_reliability_score: factors.supplier_reliability,
    match_confidence: factors.match_confidence,
    pricing_confidence: factors.pricing_confidence,
    freshness_score: factors.freshness,
    normalization_confidence: factors.normalization_confidence,
    anomaly_penalty: factors.anomaly_history,
    override_penalty: factors.correction_history,
    factors,
  };
  
  // Persist the score
  await persistOfferTrustScore(result);
  
  return result;
}

// ============================================================================
// FACTOR COLLECTION
// ============================================================================

async function collectOfferFactors(
  offer_id: string,
  supplier_id: string,
  product_id?: string
): Promise<OfferTrustFactors> {
  const [
    supplier_reliability,
    match_confidence,
    extraction_confidence,
    pricing_confidence,
    freshness,
    normalization_confidence,
    anomaly_history,
    correction_history,
  ] = await Promise.all([
    getSupplierReliabilityFactor(supplier_id),
    getMatchConfidence(offer_id, product_id),
    getExtractionConfidence(offer_id, supplier_id),
    getPricingConfidence(offer_id),
    getOfferFreshness(offer_id),
    getNormalizationConfidence(offer_id),
    getAnomalyHistory(offer_id, supplier_id),
    getCorrectionHistory(offer_id, supplier_id),
  ]);
  
  return {
    supplier_reliability,
    match_confidence,
    extraction_confidence,
    pricing_confidence,
    freshness,
    normalization_confidence,
    anomaly_history,
    correction_history,
  };
}

async function getSupplierReliabilityFactor(supplier_id: string): Promise<number> {
  const reliability = await getSupplierReliability(supplier_id);
  return reliability?.reliability_score || 0.5;
}

async function getMatchConfidence(
  offer_id: string,
  product_id?: string
): Promise<number> {
  if (!product_id) return 0.5;
  
  // Check if there's AI match reasoning for this offer->product link
  const { data: matching } = await supabaseAdmin
    .from('ai_match_reasoning')
    .select('confidence')
    .eq('canonical_product_id', product_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
    
  if (matching) {
    return Number((matching as { confidence: number }).confidence);
  }
  
  return 0.7; // Default if no specific reasoning
}

async function getExtractionConfidence(
  offer_id: string,
  supplier_id: string
): Promise<number> {
  const { data: extraction } = await supabaseAdmin
    .from('ai_extraction_results')
    .select('overall_confidence')
    .eq('supplier_id', supplier_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
    
  if (extraction) {
    return Number((extraction as { overall_confidence: number }).overall_confidence);
  }
  
  return 0.6; // Default
}

async function getPricingConfidence(offer_id: string): Promise<number> {
  const { data: pricing } = await supabaseAdmin
    .from('ai_pricing_analysis')
    .select('confidence, is_suspicious')
    .eq('offer_id', offer_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
    
  if (pricing) {
    const p = pricing as { confidence: number; is_suspicious: boolean };
    // Reduce confidence if suspicious
    return p.is_suspicious ? Number(p.confidence) * 0.5 : Number(p.confidence);
  }
  
  return 0.7; // Default
}

async function getOfferFreshness(offer_id: string): Promise<number> {
  const { data: offer } = await supabaseAdmin
    .from('supplier_offers')
    .select('updated_at')
    .eq('id', offer_id)
    .single();
    
  // No offer = very low freshness
  if (!offer) return 0.2;
  
  const o = offer as { updated_at: string };
  const ageMs = Date.now() - new Date(o.updated_at).getTime();
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  
  // Stricter freshness scoring - stale offers are a serious concern
  if (ageDays < 1) return 1.0;
  if (ageDays < 2) return 0.95;
  if (ageDays < 3) return 0.9;
  if (ageDays < 7) return 0.7;
  if (ageDays < STALE_OFFER_THRESHOLD_DAYS) return 0.4;
  if (ageDays < VERY_STALE_THRESHOLD_DAYS) return 0.15;  // Near-worthless
  return 0.05;  // Very stale = effectively untrusted
}

async function getNormalizationConfidence(offer_id: string): Promise<number> {
  // Check for pack normalization issues
  const { data: offer } = await supabaseAdmin
    .from('supplier_offers')
    .select('units_per_case, price, price_basis')
    .eq('id', offer_id)
    .single();
    
  if (!offer) return 0.2;  // No data = very low confidence
  
  const o = offer as { units_per_case: number | null; price: number | null; price_basis?: string };
  
  // Missing units_per_case is a critical issue - can't compare offers
  if (!o.units_per_case) return 0.15;
  
  // No price = can't validate normalization
  if (!o.price || o.price <= 0) return 0.2;
  
  // Check if price per unit seems reasonable for gloves
  const perUnit = o.price / o.units_per_case;
  
  // Very low per-unit price (<$0.005) likely indicates wrong pack size
  if (perUnit < 0.005) return 0.2;
  
  // Very high per-unit price (>$2) for disposable gloves is suspicious
  if (perUnit > 2.0) return 0.4;
  
  // Unusual pack sizes are less trustworthy
  const commonPackSizes = [100, 200, 250, 500, 1000, 2000, 2500];
  if (!commonPackSizes.includes(o.units_per_case)) {
    // Uncommon but reasonable sizes get slight penalty
    if (o.units_per_case % 50 !== 0) return 0.6;
  }
  
  return 0.85;
}

async function getAnomalyHistory(
  offer_id: string,
  supplier_id: string
): Promise<number> {
  // Check for past anomalies on this offer
  const { data: anomalies } = await supabaseAdmin
    .from('ai_pricing_analysis')
    .select('is_suspicious')
    .or(`offer_id.eq.${offer_id},supplier_id.eq.${supplier_id}`)
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .limit(20);
    
  if (!anomalies || anomalies.length === 0) return 0;
  
  const suspicious = anomalies.filter(
    (a: { is_suspicious: boolean }) => a.is_suspicious
  ).length;
  
  return suspicious / anomalies.length;
}

async function getCorrectionHistory(
  offer_id: string,
  supplier_id: string
): Promise<number> {
  // Check for past human corrections
  const { data: corrections } = await supabaseAdmin
    .from('ai_feedback')
    .select('was_correct')
    .eq('source_table', 'supplier_offers')
    .gte('corrected_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .limit(20);
    
  if (!corrections || corrections.length === 0) return 0;
  
  const corrected = corrections.filter(
    (c: { was_correct: boolean }) => !c.was_correct
  ).length;
  
  return corrected / corrections.length;
}

// ============================================================================
// PERSISTENCE
// ============================================================================

async function persistOfferTrustScore(score: OfferTrustScore): Promise<void> {
  await supabaseAdmin
    .from('offer_trust_scores')
    .insert({
      offer_id: score.offer_id,
      supplier_id: score.supplier_id,
      product_id: score.product_id,
      trust_score: score.trust_score,
      trust_band: score.trust_band,
      supplier_reliability_score: score.supplier_reliability_score,
      match_confidence: score.match_confidence,
      pricing_confidence: score.pricing_confidence,
      freshness_score: score.freshness_score,
      normalization_confidence: score.normalization_confidence,
      anomaly_penalty: score.anomaly_penalty,
      override_penalty: score.override_penalty,
      factors: score.factors,
      calculated_at: new Date().toISOString(),
    });
}

// ============================================================================
// BATCH CALCULATION
// ============================================================================

export async function calculateOfferTrustScoresForProduct(
  product_id: string
): Promise<OfferTrustScore[]> {
  const { data: offers } = await supabaseAdmin
    .from('supplier_offers')
    .select('id')
    .eq('product_id', product_id)
    .eq('is_active', true);
    
  if (!offers) return [];
  
  const results: OfferTrustScore[] = [];
  
  for (const offer of offers) {
    const o = offer as { id: string };
    try {
      const score = await calculateOfferTrustScore(o.id);
      results.push(score);
    } catch (error) {
      console.error(`Failed to calculate trust for offer ${o.id}:`, error);
    }
  }
  
  return results;
}

// ============================================================================
// RETRIEVAL
// ============================================================================

export async function getOfferTrust(offer_id: string): Promise<OfferTrustScore | null> {
  const { data } = await supabaseAdmin
    .from('offer_trust_scores')
    .select('*')
    .eq('offer_id', offer_id)
    .order('calculated_at', { ascending: false })
    .limit(1)
    .single();
    
  if (!data) return null;
  
  return {
    offer_id: data.offer_id,
    supplier_id: data.supplier_id,
    product_id: data.product_id,
    trust_score: Number(data.trust_score),
    trust_band: data.trust_band as TrustBand,
    supplier_reliability_score: Number(data.supplier_reliability_score),
    match_confidence: Number(data.match_confidence),
    pricing_confidence: Number(data.pricing_confidence),
    freshness_score: Number(data.freshness_score),
    normalization_confidence: Number(data.normalization_confidence),
    anomaly_penalty: Number(data.anomaly_penalty),
    override_penalty: Number(data.override_penalty),
    factors: data.factors as OfferTrustFactors,
  };
}

export async function getLowTrustWinners(): Promise<OfferTrustScore[]> {
  const { data } = await supabaseAdmin
    .from('low_trust_winners')
    .select('*')
    .limit(20);
    
  if (!data) return [];
  
  return data.map(d => ({
    offer_id: d.offer_id,
    supplier_id: d.supplier_id,
    product_id: d.product_id,
    trust_score: Number(d.trust_score),
    trust_band: d.trust_band as TrustBand,
    supplier_reliability_score: 0,
    match_confidence: 0,
    pricing_confidence: 0,
    freshness_score: 0,
    normalization_confidence: 0,
    anomaly_penalty: Number(d.anomaly_penalty),
    override_penalty: Number(d.override_penalty),
    factors: {} as OfferTrustFactors,
  }));
}

// ============================================================================
// TRUST-BASED PRICE FILTERING
// ============================================================================

/**
 * Check if an offer should be allowed as "best price" winner
 * Low-trust offers cannot silently win without review
 */
export function shouldOfferRequireReview(trust: OfferTrustScore): boolean {
  return trust.trust_band === 'low_trust' || trust.trust_band === 'review_sensitive';
}

/**
 * Calculate trust-adjusted price for comparison
 * Lower trust = effective price increases (less attractive)
 * 
 * Uses exponential penalty to make low-trust offers significantly less attractive:
 * - 1.0 trust = 0% penalty
 * - 0.8 trust = ~7% penalty  
 * - 0.6 trust = ~18% penalty
 * - 0.4 trust = ~35% penalty
 * - 0.2 trust = ~60% penalty
 * - 0.0 trust = 100% penalty (double the price)
 */
export function calculateTrustAdjustedPrice(
  raw_price: number,
  trust_score: number
): number {
  // Exponential trust penalty: low trust adds significantly more to effective price
  // Formula: penalty = (1 - trust)^1.5 * max_penalty
  const maxPenalty = 1.0;  // Up to 100% penalty for 0 trust
  const trustPenalty = Math.pow(1 - trust_score, 1.5) * maxPenalty;
  return raw_price * (1 + trustPenalty);
}
