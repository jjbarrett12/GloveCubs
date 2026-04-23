/**
 * Margin Opportunity Engine
 * 
 * Identifies where money is being left on the table by analyzing:
 * - market spread
 * - best trusted offer delta
 * - stale incumbent offer
 * - likely pack mismatch hiding a better price
 * - repeat anomaly patterns
 * - frequency of manual corrections
 * - category importance
 */

import { supabaseAdmin, getSupabaseCatalogos } from '../jobs/supabase';
import { categorySlugFromCatalogosProductRow } from '../catalog/canonical-read-model';
import { 
  calculateOfferTrustScore, 
  calculateTrustAdjustedPrice,
  type OfferTrustScore 
} from './offerTrust';

// ============================================================================
// TYPES
// ============================================================================

export type OpportunityBand = 'major' | 'meaningful' | 'minor' | 'none';

export interface MarginOpportunityFactors {
  market_spread_percent: number;
  current_vs_best_delta: number;
  best_offer_trust: number;
  current_offer_freshness: number;
  pack_normalization_risk: boolean;
  anomaly_pattern_detected: boolean;
  correction_frequency: number;
  category_importance: number;
}

export interface MarginOpportunity {
  product_id: string;
  best_offer_id: string | null;
  current_offer_id: string | null;
  opportunity_score: number;
  opportunity_band: OpportunityBand;
  estimated_savings_per_case: number | null;
  estimated_savings_percent: number | null;
  market_spread: number;
  trust_adjusted_best_price: number | null;
  current_price: number | null;
  requires_review: boolean;
  review_reason: string | null;
  reasoning: string;
  factors: MarginOpportunityFactors;
}

// ============================================================================
// SCORING WEIGHTS
// ============================================================================

const OPPORTUNITY_WEIGHTS = {
  spread_magnitude: 0.30,
  savings_potential: 0.30,
  trust_differential: 0.15,
  freshness_gap: 0.10,
  category_importance: 0.10,
  pack_risk_penalty: 0.03,
  anomaly_penalty: 0.02,
};

// ============================================================================
// BAND THRESHOLDS
// ============================================================================

function determineOpportunityBand(score: number, savings_percent: number | null): OpportunityBand {
  // Use both score and savings to determine band
  if (score >= 0.7 || (savings_percent && savings_percent >= 15)) return 'major';
  if (score >= 0.4 || (savings_percent && savings_percent >= 8)) return 'meaningful';
  if (score >= 0.2 || (savings_percent && savings_percent >= 3)) return 'minor';
  return 'none';
}

// ============================================================================
// MAIN SCORING FUNCTION
// ============================================================================

// Minimum trust score to include offer in comparisons
const MIN_TRUST_FOR_COMPARISON = 0.3;

// Pack size variance threshold for valid comparison
const MAX_PACK_SIZE_VARIANCE = 0.20;  // 20% variance allowed

export async function calculateMarginOpportunity(
  product_id: string
): Promise<MarginOpportunity> {
  // Load all active offers for this product
  const { data: offers } = await supabaseAdmin
    .from('supplier_offers')
    .select('id, supplier_id, price, units_per_case, updated_at, is_active')
    .eq('product_id', product_id)
    .eq('is_active', true)
    .order('price', { ascending: true });
    
  if (!offers || offers.length === 0) {
    return createNoOpportunityResult(product_id, 'No active offers found');
  }
  
  // Calculate trust scores for all offers
  const offersWithTrust: Array<{
    id: string;
    price: number;
    units_per_case: number | null;
    updated_at: string;
    trust: OfferTrustScore;
    trust_adjusted_price: number;
    per_unit_price: number | null;
  }> = [];
  
  for (const offer of offers) {
    const o = offer as { id: string; price: number; units_per_case: number | null; updated_at: string };
    try {
      const trust = await calculateOfferTrustScore(o.id);
      
      // Filter out low-trust offers entirely - they shouldn't influence opportunity calculations
      if (trust.trust_score < MIN_TRUST_FOR_COMPARISON) {
        console.warn(`[MarginOpp] Excluding low-trust offer ${o.id} (trust: ${trust.trust_score.toFixed(2)})`);
        continue;
      }
      
      const adjustedPrice = calculateTrustAdjustedPrice(o.price, trust.trust_score);
      const per_unit_price = o.units_per_case && o.units_per_case > 0 
        ? o.price / o.units_per_case 
        : null;
      
      offersWithTrust.push({
        id: o.id,
        price: o.price,
        units_per_case: o.units_per_case,
        updated_at: o.updated_at,
        trust,
        trust_adjusted_price: adjustedPrice,
        per_unit_price,
      });
    } catch (error) {
      console.error(`Failed to calculate trust for offer ${o.id}:`, error);
    }
  }
  
  if (offersWithTrust.length === 0) {
    return createNoOpportunityResult(product_id, 'No sufficiently trusted offers found');
  }
  
  // Validate pack size consistency before comparisons
  const packSizeValidation = validatePackSizeConsistency(offersWithTrust);
  
  // If pack sizes are inconsistent, filter to comparable offers only
  let comparableOffers = offersWithTrust;
  if (!packSizeValidation.isConsistent) {
    // Keep only offers with pack sizes within the dominant group
    comparableOffers = filterToComparablePackSizes(offersWithTrust);
    
    if (comparableOffers.length < 2) {
      return createNoOpportunityResult(
        product_id, 
        `Pack size mismatch prevents comparison: ${packSizeValidation.reason}`
      );
    }
  }
  
  // Sort by trust-adjusted price to find best TRUSTED offer
  const sortedByTrustAdjusted = [...comparableOffers].sort(
    (a, b) => a.trust_adjusted_price - b.trust_adjusted_price
  );
  
  // Sort by raw price to find cheapest
  const sortedByRawPrice = [...comparableOffers].sort(
    (a, b) => a.price - b.price
  );
  
  const bestTrusted = sortedByTrustAdjusted[0];
  const cheapest = sortedByRawPrice[0];
  
  // Assume current offer is the cheapest (this would be determined by existing logic)
  const currentOffer = cheapest;
  
  // Calculate market spread
  const maxPrice = Math.max(...offersWithTrust.map(o => o.price));
  const minPrice = Math.min(...offersWithTrust.map(o => o.price));
  const market_spread = minPrice > 0 ? ((maxPrice - minPrice) / minPrice) * 100 : 0;
  
  // Collect factors
  const factors = await collectOpportunityFactors(
    product_id,
    comparableOffers,
    bestTrusted,
    currentOffer
  );
  
  // Calculate opportunity score
  const spreadScore = Math.min(1, market_spread / 30); // Max at 30% spread
  const savingsScore = factors.current_vs_best_delta / 20; // Max at 20% savings
  const trustDiff = factors.best_offer_trust - (currentOffer.trust.trust_score || 0);
  const freshnessGap = 1 - factors.current_offer_freshness;
  
  const opportunity_score = 
    spreadScore * OPPORTUNITY_WEIGHTS.spread_magnitude +
    Math.min(1, savingsScore) * OPPORTUNITY_WEIGHTS.savings_potential +
    Math.max(0, trustDiff) * OPPORTUNITY_WEIGHTS.trust_differential +
    freshnessGap * OPPORTUNITY_WEIGHTS.freshness_gap +
    factors.category_importance * OPPORTUNITY_WEIGHTS.category_importance -
    (factors.pack_normalization_risk ? OPPORTUNITY_WEIGHTS.pack_risk_penalty : 0) -
    (factors.anomaly_pattern_detected ? OPPORTUNITY_WEIGHTS.anomaly_penalty : 0);
    
  const clampedScore = Math.max(0, Math.min(1, opportunity_score));
  
  // Calculate savings
  const savingsPerCase = currentOffer.price - bestTrusted.trust_adjusted_price;
  const savingsPercent = currentOffer.price > 0 
    ? (savingsPerCase / currentOffer.price) * 100 
    : 0;
    
  // Determine if review is required
  const requiresReview = 
    bestTrusted.trust.trust_band === 'low_trust' ||
    bestTrusted.trust.trust_band === 'review_sensitive' ||
    factors.pack_normalization_risk ||
    factors.anomaly_pattern_detected;
    
  const reviewReason = requiresReview
    ? determineReviewReason(bestTrusted.trust, factors)
    : null;
    
  // Generate reasoning
  const reasoning = generateOpportunityReasoning(
    factors,
    savingsPercent,
    market_spread,
    bestTrusted,
    currentOffer
  );
  
  const result: MarginOpportunity = {
    product_id,
    best_offer_id: bestTrusted.id,
    current_offer_id: currentOffer.id,
    opportunity_score: clampedScore,
    opportunity_band: determineOpportunityBand(clampedScore, savingsPercent),
    estimated_savings_per_case: savingsPerCase > 0 ? savingsPerCase : null,
    estimated_savings_percent: savingsPercent > 0 ? savingsPercent : null,
    market_spread,
    trust_adjusted_best_price: bestTrusted.trust_adjusted_price,
    current_price: currentOffer.price,
    requires_review: requiresReview,
    review_reason: reviewReason,
    reasoning,
    factors,
  };
  
  // Persist
  await persistMarginOpportunity(result);
  
  return result;
}

// ============================================================================
// FACTOR COLLECTION
// ============================================================================

async function collectOpportunityFactors(
  product_id: string,
  offers: Array<{ 
    id: string; 
    price: number; 
    units_per_case: number | null;
    trust: OfferTrustScore;
    trust_adjusted_price: number;
    updated_at: string;
    per_unit_price: number | null;
  }>,
  bestTrusted: { price: number; trust: OfferTrustScore; trust_adjusted_price: number },
  currentOffer: { price: number; trust: OfferTrustScore; updated_at: string }
): Promise<MarginOpportunityFactors> {
  const maxPrice = Math.max(...offers.map(o => o.price));
  const minPrice = Math.min(...offers.map(o => o.price));
  const market_spread_percent = minPrice > 0 ? ((maxPrice - minPrice) / minPrice) * 100 : 0;
  
  const current_vs_best_delta = currentOffer.price > 0
    ? ((currentOffer.price - bestTrusted.trust_adjusted_price) / currentOffer.price) * 100
    : 0;
    
  // Calculate freshness for current offer - stricter thresholds
  const ageMs = Date.now() - new Date(currentOffer.updated_at).getTime();
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  const current_offer_freshness = ageDays < 3 ? 1 : ageDays < 7 ? 0.7 : ageDays < 14 ? 0.4 : 0.15;
  
  // Check for pack normalization risk - more sophisticated check
  const packValidation = validatePackSizeConsistency(offers);
  const pack_normalization_risk = !packValidation.isConsistent;
  
  // Check for anomaly patterns
  const { data: anomalies } = await supabaseAdmin
    .from('ai_pricing_analysis')
    .select('is_suspicious')
    .eq('canonical_product_id', product_id)
    .eq('is_suspicious', true)
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .limit(10);
    
  // Lower threshold for anomaly detection - 2+ anomalies is concerning
  const anomaly_pattern_detected = (anomalies?.length || 0) >= 2;
  
  // Check correction frequency for this specific product
  const { data: corrections } = await supabaseAdmin
    .from('ai_feedback')
    .select('id')
    .eq('source_table', 'supplier_offers')
    .gte('corrected_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .limit(20);
    
  const correction_frequency = (corrections?.length || 0) / 20;
  
  // Get category importance from product data
  const category_importance = await getCategoryImportance(product_id);
  
  return {
    market_spread_percent,
    current_vs_best_delta: Math.max(0, current_vs_best_delta),
    best_offer_trust: bestTrusted.trust.trust_score,
    current_offer_freshness,
    pack_normalization_risk,
    anomaly_pattern_detected,
    correction_frequency,
    category_importance,
  };
}

async function getCategoryImportance(product_id: string): Promise<number> {
  const { data: raw } = await getSupabaseCatalogos()
    .from('products')
    .select('categories(slug)')
    .eq('id', product_id)
    .eq('is_active', true)
    .single();

  if (!raw) return 0.5;

  const category = categorySlugFromCatalogosProductRow(raw as Record<string, unknown>);

  if (category === 'exam_gloves' || category === 'surgical_gloves') {
    return 0.9;
  }

  return 0.5;
}

function determineReviewReason(
  bestTrust: OfferTrustScore,
  factors: MarginOpportunityFactors
): string {
  const reasons: string[] = [];
  
  if (bestTrust.trust_band === 'low_trust') {
    reasons.push('Best offer has low trust');
  }
  if (bestTrust.trust_band === 'review_sensitive') {
    reasons.push('Best offer is review-sensitive');
  }
  if (factors.pack_normalization_risk) {
    reasons.push('Pack normalization uncertainty');
  }
  if (factors.anomaly_pattern_detected) {
    reasons.push('Anomaly pattern detected');
  }
  
  return reasons.join('; ');
}

function generateOpportunityReasoning(
  factors: MarginOpportunityFactors,
  savingsPercent: number,
  market_spread: number,
  bestTrusted: { trust: OfferTrustScore; trust_adjusted_price: number },
  currentOffer: { price: number }
): string {
  const parts: string[] = [];
  
  if (savingsPercent > 0) {
    parts.push(`Potential ${savingsPercent.toFixed(1)}% savings available`);
  }
  
  if (market_spread > 10) {
    parts.push(`Wide market spread of ${market_spread.toFixed(1)}%`);
  }
  
  if (bestTrusted.trust.trust_band === 'high_trust') {
    parts.push('Best offer is from a trusted supplier');
  }
  
  if (factors.current_offer_freshness < 0.5) {
    parts.push('Current pricing may be stale');
  }
  
  if (factors.pack_normalization_risk) {
    parts.push('Pack size variations require verification');
  }
  
  if (parts.length === 0) {
    parts.push('No significant opportunity identified');
  }
  
  return parts.join('. ') + '.';
}

// ============================================================================
// PACK SIZE VALIDATION
// ============================================================================

interface PackSizeValidation {
  isConsistent: boolean;
  reason: string;
  dominantPackSize: number | null;
}

function validatePackSizeConsistency(
  offers: Array<{ units_per_case: number | null; per_unit_price: number | null }>
): PackSizeValidation {
  const packSizes = offers
    .map(o => o.units_per_case)
    .filter((size): size is number => size != null && size > 0);
    
  if (packSizes.length === 0) {
    return { isConsistent: false, reason: 'No valid pack sizes', dominantPackSize: null };
  }
  
  if (packSizes.length === 1) {
    return { isConsistent: true, reason: 'Single offer', dominantPackSize: packSizes[0] };
  }
  
  // Find the most common pack size
  const sizeFrequency = new Map<number, number>();
  for (const size of packSizes) {
    sizeFrequency.set(size, (sizeFrequency.get(size) || 0) + 1);
  }
  
  let dominantSize = packSizes[0];
  let maxFreq = 0;
  for (const [size, freq] of Array.from(sizeFrequency.entries())) {
    if (freq > maxFreq) {
      maxFreq = freq;
      dominantSize = size;
    }
  }
  
  // Check if all sizes are within acceptable variance of dominant
  const inconsistentSizes: number[] = [];
  for (const size of packSizes) {
    const variance = Math.abs(size - dominantSize) / dominantSize;
    if (variance > MAX_PACK_SIZE_VARIANCE) {
      inconsistentSizes.push(size);
    }
  }
  
  if (inconsistentSizes.length > 0) {
    return {
      isConsistent: false,
      reason: `Pack sizes vary too much: dominant ${dominantSize}, outliers: ${inconsistentSizes.join(', ')}`,
      dominantPackSize: dominantSize,
    };
  }
  
  return { isConsistent: true, reason: 'Pack sizes consistent', dominantPackSize: dominantSize };
}

function filterToComparablePackSizes<T extends { units_per_case: number | null }>(
  offers: T[]
): T[] {
  const validation = validatePackSizeConsistency(offers as any);
  
  if (!validation.dominantPackSize) {
    return offers;  // Can't filter, return all
  }
  
  return offers.filter(o => {
    if (!o.units_per_case) return false;
    const variance = Math.abs(o.units_per_case - validation.dominantPackSize!) / validation.dominantPackSize!;
    return variance <= MAX_PACK_SIZE_VARIANCE;
  });
}

function createNoOpportunityResult(
  product_id: string,
  reason: string
): MarginOpportunity {
  return {
    product_id,
    best_offer_id: null,
    current_offer_id: null,
    opportunity_score: 0,
    opportunity_band: 'none',
    estimated_savings_per_case: null,
    estimated_savings_percent: null,
    market_spread: 0,
    trust_adjusted_best_price: null,
    current_price: null,
    requires_review: false,
    review_reason: null,
    reasoning: reason,
    factors: {
      market_spread_percent: 0,
      current_vs_best_delta: 0,
      best_offer_trust: 0,
      current_offer_freshness: 0,
      pack_normalization_risk: false,
      anomaly_pattern_detected: false,
      correction_frequency: 0,
      category_importance: 0,
    },
  };
}

// ============================================================================
// PERSISTENCE
// ============================================================================

async function persistMarginOpportunity(opp: MarginOpportunity): Promise<void> {
  await supabaseAdmin
    .from('margin_opportunities')
    .insert({
      product_id: opp.product_id,
      best_offer_id: opp.best_offer_id,
      current_offer_id: opp.current_offer_id,
      opportunity_score: opp.opportunity_score,
      opportunity_band: opp.opportunity_band,
      estimated_savings_per_case: opp.estimated_savings_per_case,
      estimated_savings_percent: opp.estimated_savings_percent,
      market_spread: opp.market_spread,
      trust_adjusted_best_price: opp.trust_adjusted_best_price,
      current_price: opp.current_price,
      requires_review: opp.requires_review,
      review_reason: opp.review_reason,
      reasoning: opp.reasoning,
      factors: opp.factors,
      calculated_at: new Date().toISOString(),
    });
}

// ============================================================================
// BATCH CALCULATION
// ============================================================================

export async function calculateMarginOpportunitiesForTopProducts(
  limit: number = 100
): Promise<{ calculated: number; opportunities_found: number; errors: number }> {
  // Get products with multiple offers
  const { data: products } = await getSupabaseCatalogos()
    .from('products')
    .select('id')
    .eq('is_active', true)
    .limit(limit);
    
  if (!products) return { calculated: 0, opportunities_found: 0, errors: 0 };
  
  let calculated = 0;
  let opportunities_found = 0;
  let errors = 0;
  
  for (const product of products) {
    const p = product as { id: string };
    try {
      const opp = await calculateMarginOpportunity(p.id);
      calculated++;
      if (opp.opportunity_band !== 'none') {
        opportunities_found++;
      }
    } catch (error) {
      console.error(`Failed to calculate opportunity for ${p.id}:`, error);
      errors++;
    }
  }
  
  return { calculated, opportunities_found, errors };
}

// ============================================================================
// RETRIEVAL
// ============================================================================

export async function getTopMarginOpportunities(
  limit: number = 20
): Promise<MarginOpportunity[]> {
  const { data } = await supabaseAdmin
    .from('top_margin_opportunities')
    .select('*')
    .limit(limit);
    
  if (!data) return [];
  
  return data.map(d => ({
    product_id: d.product_id,
    best_offer_id: d.best_offer_id,
    current_offer_id: null,
    opportunity_score: Number(d.opportunity_score),
    opportunity_band: d.opportunity_band as OpportunityBand,
    estimated_savings_per_case: d.estimated_savings_per_case ? Number(d.estimated_savings_per_case) : null,
    estimated_savings_percent: d.estimated_savings_percent ? Number(d.estimated_savings_percent) : null,
    market_spread: Number(d.market_spread),
    trust_adjusted_best_price: null,
    current_price: null,
    requires_review: d.requires_review,
    review_reason: null,
    reasoning: d.reasoning,
    factors: {} as MarginOpportunityFactors,
  }));
}

export async function getOpportunitiesRequiringReview(): Promise<MarginOpportunity[]> {
  const { data } = await supabaseAdmin
    .from('margin_opportunities')
    .select('*')
    .eq('requires_review', true)
    .in('opportunity_band', ['major', 'meaningful'])
    .order('opportunity_score', { ascending: false })
    .limit(20);
    
  if (!data) return [];
  
  return data.map(d => ({
    product_id: d.product_id,
    best_offer_id: d.best_offer_id,
    current_offer_id: d.current_offer_id,
    opportunity_score: Number(d.opportunity_score),
    opportunity_band: d.opportunity_band as OpportunityBand,
    estimated_savings_per_case: d.estimated_savings_per_case ? Number(d.estimated_savings_per_case) : null,
    estimated_savings_percent: d.estimated_savings_percent ? Number(d.estimated_savings_percent) : null,
    market_spread: Number(d.market_spread),
    trust_adjusted_best_price: d.trust_adjusted_best_price ? Number(d.trust_adjusted_best_price) : null,
    current_price: d.current_price ? Number(d.current_price) : null,
    requires_review: d.requires_review,
    review_reason: d.review_reason,
    reasoning: d.reasoning,
    factors: d.factors as MarginOpportunityFactors,
  }));
}
