/**
 * Supplier Recommendation Engine
 * 
 * Ranks suppliers for a product using weighted procurement quality:
 * - normalized price
 * - offer trust
 * - supplier reliability
 * - freshness
 * - anomaly history
 * - lead time if available
 * - operator correction history
 * 
 * RULE: Cheapest is not always first. A low-trust cheapest offer must not
 * outrank a slightly more expensive but high-trust offer unless the
 * difference is materially justified.
 */

import { supabaseAdmin } from '../jobs/supabase';
import { getSupplierReliability, type SupplierReliabilityScore } from './supplierReliability';
import { calculateOfferTrustScore, type OfferTrustScore } from './offerTrust';

// ============================================================================
// TYPES
// ============================================================================

export type RecommendationBand = 'strong_recommendation' | 'acceptable' | 'caution' | 'do_not_prefer';

export interface SupplierRecommendationFactors {
  price_score: number;           // 0-1: Lower price = higher score
  trust_score: number;           // 0-1: Offer trust
  reliability_score: number;     // 0-1: Supplier reliability
  freshness_score: number;       // 0-1: Data freshness
  anomaly_penalty: number;       // 0-1: Penalty for anomalies
  correction_penalty: number;    // 0-1: Penalty for corrections
  lead_time_score: number;       // 0-1: Better lead time = higher
}

export interface SupplierRecommendation {
  product_id: string;
  supplier_id: string;
  offer_id: string;
  recommended_rank: number;
  recommendation_score: number;
  recommendation_band: RecommendationBand;
  recommendation_reasoning: string;
  why_not_first: string | null;
  review_required: boolean;
  price: number;
  trust_score: number;
  factors: SupplierRecommendationFactors;
}

// ============================================================================
// SCORING WEIGHTS
// ============================================================================

const RECOMMENDATION_WEIGHTS = {
  price: 0.30,           // Price matters, but not most
  trust: 0.25,           // Trust is critical
  reliability: 0.20,     // Supplier track record
  freshness: 0.10,       // Data freshness
  lead_time: 0.08,       // Delivery speed
  anomaly_penalty: 0.04, // Subtract for anomalies
  correction_penalty: 0.03, // Subtract for corrections
};

// Material justification threshold: how much cheaper must low-trust be to win
// Increased to 25% - low-trust offers need substantial savings to justify risk
const MATERIAL_PRICE_ADVANTAGE_THRESHOLD = 0.25;

// Minimum trust score for any offer to be considered as rank 1
const MIN_TRUST_FOR_TOP_RANK = 0.35;

// Flag indicating review is strictly enforced (not just informational)
const ENFORCE_REVIEW_FOR_LOW_TRUST = true;

// ============================================================================
// BAND THRESHOLDS
// ============================================================================

function determineRecommendationBand(
  score: number,
  trust_band: string,
  reliability_band: string,
  rank: number
): RecommendationBand {
  // Hard override: low trust or risky supplier cannot be "strong_recommendation"
  if (trust_band === 'low_trust') {
    return 'do_not_prefer';
  }
  
  if (reliability_band === 'risky') {
    return score >= 0.5 ? 'caution' : 'do_not_prefer';
  }
  
  if (trust_band === 'review_sensitive' || reliability_band === 'watch') {
    // Review-sensitive can be "acceptable" at best
    return score >= 0.6 ? 'acceptable' : 'caution';
  }
  
  // Only rank 1 can be "strong_recommendation"
  if (rank > 1 && score >= 0.75) {
    return 'acceptable';
  }
  
  if (score >= 0.75) return 'strong_recommendation';
  if (score >= 0.50) return 'acceptable';
  if (score >= 0.25) return 'caution';
  return 'do_not_prefer';
}

// ============================================================================
// MAIN RANKING FUNCTION
// ============================================================================

export async function rankSuppliersForProduct(
  product_id: string
): Promise<SupplierRecommendation[]> {
  // Load all active offers for this product
  const { data: offers } = await supabaseAdmin
    .from('supplier_offers')
    .select('id, supplier_id, price, lead_time_days, updated_at')
    .eq('product_id', product_id)
    .eq('is_active', true);
    
  if (!offers || offers.length === 0) {
    return [];
  }
  
  // Build scored recommendations
  const recommendations: Array<{
    offer: { id: string; supplier_id: string; price: number; lead_time_days: number | null; updated_at: string };
    trust: OfferTrustScore;
    reliability: SupplierReliabilityScore | null;
    factors: SupplierRecommendationFactors;
    raw_score: number;
  }> = [];
  
  // Get price range for normalization
  const prices = offers.map(o => (o as { price: number }).price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice || 1;
  
  for (const offer of offers) {
    const o = offer as { 
      id: string; 
      supplier_id: string; 
      price: number; 
      lead_time_days: number | null;
      updated_at: string;
    };
    
    try {
      // Get trust and reliability scores
      const trust = await calculateOfferTrustScore(o.id);
      const reliability = await getSupplierReliability(o.supplier_id);
      
      // Calculate factors
      const factors = await calculateRecommendationFactors(
        o,
        trust,
        reliability,
        minPrice,
        priceRange
      );
      
      // Calculate raw score
      const raw_score = calculateRawScore(factors);
      
      recommendations.push({
        offer: o,
        trust,
        reliability,
        factors,
        raw_score,
      });
    } catch (error) {
      console.error(`Failed to score offer ${o.id}:`, error);
    }
  }
  
  if (recommendations.length === 0) {
    return [];
  }
  
  // Apply trust-price fairness rule
  const adjusted = applyTrustPriceFairnessRule(recommendations, minPrice);
  
  // Sort by adjusted score
  adjusted.sort((a, b) => b.adjusted_score - a.adjusted_score);
  
  // Build final recommendations with rankings
  const results: SupplierRecommendation[] = [];
  
  for (let i = 0; i < adjusted.length; i++) {
    const rec = adjusted[i];
    const rank = i + 1;
    
    const band = determineRecommendationBand(
      rec.adjusted_score,
      rec.trust.trust_band,
      rec.reliability?.reliability_band || 'stable',
      rank
    );
    
    const reasoning = generateRecommendationReasoning(rec, rank);
    const whyNotFirst = rank > 1 ? generateWhyNotFirstReasoning(rec, adjusted[0]) : null;
    
    const review_required = 
      rec.trust.trust_band === 'low_trust' ||
      rec.trust.trust_band === 'review_sensitive' ||
      rec.reliability?.reliability_band === 'risky' ||
      rec.reliability?.reliability_band === 'watch';
      
    const result: SupplierRecommendation = {
      product_id,
      supplier_id: rec.offer.supplier_id,
      offer_id: rec.offer.id,
      recommended_rank: rank,
      recommendation_score: rec.adjusted_score,
      recommendation_band: band,
      recommendation_reasoning: reasoning,
      why_not_first: whyNotFirst,
      review_required,
      price: rec.offer.price,
      trust_score: rec.trust.trust_score,
      factors: rec.factors,
    };
    
    results.push(result);
    
    // Persist
    await persistSupplierRecommendation(result);
  }
  
  return results;
}

// ============================================================================
// FACTOR CALCULATION
// ============================================================================

async function calculateRecommendationFactors(
  offer: { id: string; supplier_id: string; price: number; lead_time_days: number | null; updated_at: string },
  trust: OfferTrustScore,
  reliability: SupplierReliabilityScore | null,
  minPrice: number,
  priceRange: number
): Promise<SupplierRecommendationFactors> {
  // Price score: lower is better (normalized 0-1)
  const price_score = priceRange > 0 
    ? 1 - ((offer.price - minPrice) / priceRange)
    : 1;
    
  // Trust score from offer trust
  const trust_score = trust.trust_score;
  
  // Reliability score from supplier
  const reliability_score = reliability?.reliability_score || 0.5;
  
  // Freshness based on last update
  const ageMs = Date.now() - new Date(offer.updated_at).getTime();
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  const freshness_score = ageDays < 1 ? 1 : ageDays < 7 ? 0.8 : ageDays < 30 ? 0.5 : 0.2;
  
  // Lead time score (shorter is better)
  const lead_time_score = offer.lead_time_days 
    ? Math.max(0, 1 - (offer.lead_time_days / 14)) // Best if < 1 day, worst at 14+ days
    : 0.5; // Unknown lead time gets neutral score
    
  // Penalties
  const anomaly_penalty = trust.anomaly_penalty;
  const correction_penalty = trust.override_penalty;
  
  return {
    price_score,
    trust_score,
    reliability_score,
    freshness_score,
    anomaly_penalty,
    correction_penalty,
    lead_time_score,
  };
}

function calculateRawScore(factors: SupplierRecommendationFactors): number {
  const positive = 
    factors.price_score * RECOMMENDATION_WEIGHTS.price +
    factors.trust_score * RECOMMENDATION_WEIGHTS.trust +
    factors.reliability_score * RECOMMENDATION_WEIGHTS.reliability +
    factors.freshness_score * RECOMMENDATION_WEIGHTS.freshness +
    factors.lead_time_score * RECOMMENDATION_WEIGHTS.lead_time;
    
  const penalties = 
    factors.anomaly_penalty * RECOMMENDATION_WEIGHTS.anomaly_penalty +
    factors.correction_penalty * RECOMMENDATION_WEIGHTS.correction_penalty;
    
  return Math.max(0, Math.min(1, positive - penalties));
}

// ============================================================================
// TRUST-PRICE FAIRNESS RULE
// ============================================================================

interface AdjustedRecommendation {
  offer: { id: string; supplier_id: string; price: number; lead_time_days: number | null; updated_at: string };
  trust: OfferTrustScore;
  reliability: SupplierReliabilityScore | null;
  factors: SupplierRecommendationFactors;
  raw_score: number;
  adjusted_score: number;
  fairness_adjustment: string | null;
}

function applyTrustPriceFairnessRule(
  recommendations: Array<{
    offer: { id: string; supplier_id: string; price: number; lead_time_days: number | null; updated_at: string };
    trust: OfferTrustScore;
    reliability: SupplierReliabilityScore | null;
    factors: SupplierRecommendationFactors;
    raw_score: number;
  }>,
  minPrice: number
): AdjustedRecommendation[] {
  // Find the best high-trust offer
  const highTrust = recommendations
    .filter(r => r.trust.trust_band === 'high_trust' || r.trust.trust_band === 'medium_trust')
    .sort((a, b) => a.offer.price - b.offer.price)[0];
    
  if (!highTrust) {
    // No high-trust offers - all offers get significant penalty
    console.warn('[SupplierReco] No high-trust offers found, all recommendations will require review');
    return recommendations.map(r => ({
      ...r,
      adjusted_score: Math.min(r.raw_score, 0.5),  // Cap at 0.5 without high-trust anchor
      fairness_adjustment: 'No trusted benchmark available - score capped',
    }));
  }
  
  return recommendations.map(r => {
    let adjusted_score = r.raw_score;
    let fairness_adjustment: string | null = null;
    
    // Hard block: low_trust offers cannot be rank 1 regardless of price
    if (r.trust.trust_band === 'low_trust' && ENFORCE_REVIEW_FOR_LOW_TRUST) {
      adjusted_score = Math.min(adjusted_score, highTrust.raw_score - 0.1);
      fairness_adjustment = 'Low trust: demoted below trusted offers regardless of price';
      return { ...r, adjusted_score, fairness_adjustment };
    }
    
    // If this is a review-sensitive offer that's cheaper than high-trust
    if (r.trust.trust_band === 'review_sensitive' && r.offer.price < highTrust.offer.price) {
      const priceDiff = (highTrust.offer.price - r.offer.price) / highTrust.offer.price;
      
      // Only allow review-sensitive to win if price advantage is material (>25%)
      if (priceDiff < MATERIAL_PRICE_ADVANTAGE_THRESHOLD) {
        // Penalize: make score worse than high-trust
        adjusted_score = highTrust.raw_score - 0.03;
        fairness_adjustment = `Demoted: ${(priceDiff * 100).toFixed(1)}% cheaper but review-sensitive, requires ${(MATERIAL_PRICE_ADVANTAGE_THRESHOLD * 100).toFixed(0)}% advantage`;
      } else {
        // Allow but flag it clearly
        fairness_adjustment = `Materially cheaper (${(priceDiff * 100).toFixed(1)}%), allowed with review required`;
      }
    }
    
    // Very low trust scores get additional penalty
    if (r.trust.trust_score < MIN_TRUST_FOR_TOP_RANK) {
      adjusted_score = Math.min(adjusted_score, 0.4);
      fairness_adjustment = (fairness_adjustment ? fairness_adjustment + '; ' : '') + 
        `Trust score ${(r.trust.trust_score * 100).toFixed(0)}% below minimum threshold`;
    }
    
    return {
      ...r,
      adjusted_score,
      fairness_adjustment,
    };
  });
}

// ============================================================================
// REASONING GENERATION
// ============================================================================

function generateRecommendationReasoning(
  rec: AdjustedRecommendation,
  rank: number
): string {
  const parts: string[] = [];
  
  if (rank === 1) {
    parts.push('Recommended as top choice');
  } else {
    parts.push(`Ranked #${rank}`);
  }
  
  // Trust
  if (rec.trust.trust_band === 'high_trust') {
    parts.push('High trust');
  } else if (rec.trust.trust_band === 'low_trust') {
    parts.push('Low trust - use with caution');
  }
  
  // Reliability
  if (rec.reliability?.reliability_band === 'trusted') {
    parts.push('Trusted supplier');
  } else if (rec.reliability?.reliability_band === 'risky') {
    parts.push('Risky supplier history');
  }
  
  // Price
  if (rec.factors.price_score >= 0.9) {
    parts.push('Best price');
  } else if (rec.factors.price_score >= 0.7) {
    parts.push('Competitive price');
  }
  
  // Freshness
  if (rec.factors.freshness_score < 0.5) {
    parts.push('Pricing data may be stale');
  }
  
  // Fairness adjustment
  if (rec.fairness_adjustment) {
    parts.push(rec.fairness_adjustment);
  }
  
  return parts.join('. ') + '.';
}

function generateWhyNotFirstReasoning(
  rec: AdjustedRecommendation,
  first: AdjustedRecommendation
): string {
  const reasons: string[] = [];
  
  // Trust comparison
  if (rec.trust.trust_score < first.trust.trust_score - 0.1) {
    reasons.push(`Lower trust (${(rec.trust.trust_score * 100).toFixed(0)}% vs ${(first.trust.trust_score * 100).toFixed(0)}%)`);
  }
  
  // Reliability comparison
  const recRel = rec.reliability?.reliability_score || 0.5;
  const firstRel = first.reliability?.reliability_score || 0.5;
  if (recRel < firstRel - 0.1) {
    reasons.push(`Less reliable supplier`);
  }
  
  // Price comparison (if rec is more expensive)
  if (rec.offer.price > first.offer.price) {
    const diff = ((rec.offer.price - first.offer.price) / first.offer.price * 100).toFixed(1);
    reasons.push(`${diff}% more expensive`);
  }
  
  // Freshness
  if (rec.factors.freshness_score < first.factors.freshness_score - 0.2) {
    reasons.push(`Staler data`);
  }
  
  if (reasons.length === 0) {
    reasons.push('Close overall score but slightly lower weighted quality');
  }
  
  return reasons.join('; ');
}

// ============================================================================
// PERSISTENCE
// ============================================================================

async function persistSupplierRecommendation(rec: SupplierRecommendation): Promise<void> {
  await supabaseAdmin
    .from('supplier_recommendations')
    .insert({
      product_id: rec.product_id,
      supplier_id: rec.supplier_id,
      offer_id: rec.offer_id,
      recommended_rank: rec.recommended_rank,
      recommendation_score: rec.recommendation_score,
      recommendation_band: rec.recommendation_band,
      recommendation_reasoning: rec.recommendation_reasoning,
      why_not_first: rec.why_not_first,
      review_required: rec.review_required,
      price: rec.price,
      trust_score: rec.trust_score,
      factors: rec.factors,
      calculated_at: new Date().toISOString(),
    });
}

// ============================================================================
// RETRIEVAL
// ============================================================================

export async function getRecommendationsForProduct(
  product_id: string
): Promise<SupplierRecommendation[]> {
  const { data } = await supabaseAdmin
    .from('supplier_recommendations')
    .select('*')
    .eq('product_id', product_id)
    .order('recommended_rank', { ascending: true })
    .limit(10);
    
  if (!data) return [];
  
  return data.map(d => ({
    product_id: d.product_id,
    supplier_id: d.supplier_id,
    offer_id: d.offer_id,
    recommended_rank: d.recommended_rank,
    recommendation_score: Number(d.recommendation_score),
    recommendation_band: d.recommendation_band as RecommendationBand,
    recommendation_reasoning: d.recommendation_reasoning,
    why_not_first: d.why_not_first,
    review_required: d.review_required,
    price: Number(d.price),
    trust_score: Number(d.trust_score),
    factors: d.factors as SupplierRecommendationFactors,
  }));
}

export async function getRecommendationsRequiringReview(
  limit: number = 20
): Promise<SupplierRecommendation[]> {
  const { data } = await supabaseAdmin
    .from('supplier_recommendations')
    .select('*')
    .eq('review_required', true)
    .eq('recommended_rank', 1) // Only top recommendations
    .order('recommendation_score', { ascending: false })
    .limit(limit);
    
  if (!data) return [];
  
  return data.map(d => ({
    product_id: d.product_id,
    supplier_id: d.supplier_id,
    offer_id: d.offer_id,
    recommended_rank: d.recommended_rank,
    recommendation_score: Number(d.recommendation_score),
    recommendation_band: d.recommendation_band as RecommendationBand,
    recommendation_reasoning: d.recommendation_reasoning,
    why_not_first: d.why_not_first,
    review_required: d.review_required,
    price: Number(d.price),
    trust_score: Number(d.trust_score),
    factors: d.factors as SupplierRecommendationFactors,
  }));
}
