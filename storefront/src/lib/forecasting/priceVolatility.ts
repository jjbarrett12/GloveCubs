/**
 * Price Volatility Forecasting
 * 
 * Predicts price volatility for products and offers.
 * 
 * SAFETY RULES:
 * - Do not confuse one-time anomalies with volatility
 * - Require enough historical observations
 * - Use trust-adjusted signals, not raw cheapest-price noise
 * - Persist reasoning and evidence counts
 */

import { supabaseAdmin, getSupabaseCatalogos } from '../jobs/supabase';

// ============================================================================
// TYPES
// ============================================================================

export type VolatilityBand = 'high_volatility' | 'elevated' | 'stable' | 'low_signal';
export type VolatilityDirection = 'increasing' | 'stable' | 'decreasing' | 'insufficient_signal';

export interface PriceVolatilityForecast {
  product_id: string;
  offer_id?: string;
  volatility_score: number;
  volatility_band: VolatilityBand;
  predicted_direction: VolatilityDirection;
  predicted_risk: string;
  reasoning: string;
  evidence: VolatilityEvidence;
  window_days: number;
  sample_size: number;
  confidence: number;
}

export interface VolatilityEvidence {
  price_points?: number;
  spread_recent?: number;
  spread_previous?: number;
  anomaly_count?: number;
  swing_count?: number;
  stale_offers?: number;
  low_trust_offers?: number;
  coefficient_of_variation?: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const VOLATILITY_CONFIG = {
  min_sample_size: 10,            // Increased from 5 for statistical validity
  min_price_points: 8,            // Increased from 3 - need enough points for meaningful CV
  window_days: 30,
  comparison_window_days: 60,
  
  // Volatility thresholds
  high_cv_threshold: 0.25,        // 25% coefficient of variation = high volatility
  elevated_cv_threshold: 0.15,    // 15% = elevated
  swing_count_threshold: 4,       // Increased from 3 - need stronger signal
  anomaly_threshold: 3,           // Increased from 2 - single anomaly shouldn't trigger
  
  // Confidence
  min_confidence_threshold: 0.5,  // Increased from 0.4
  
  // Anomaly recency requirement (days)
  anomaly_recency_days: 14,       // Anomalies must be recent to count
};

// ============================================================================
// MAIN FORECASTING FUNCTION
// ============================================================================

export async function generatePriceVolatilityForecasts(): Promise<{
  generated: number;
  suppressed: number;
  high_volatility_count: number;
}> {
  let generated = 0;
  let suppressed = 0;
  let high_volatility_count = 0;
  
  // Get all active products
  const { data: products } = await getSupabaseCatalogos()
    .from('products')
    .select('id')
    .eq('is_active', true)
    .limit(500);
    
  if (!products) return { generated: 0, suppressed: 0, high_volatility_count: 0 };
  
  for (const product of products) {
    const productId = (product as { id: string }).id;
    
    const forecast = await generateProductVolatilityForecast(productId);
    
    if (forecast) {
      if (forecast.predicted_direction !== 'insufficient_signal') {
        await persistVolatilityForecast(forecast);
        generated++;
        if (forecast.volatility_band === 'high_volatility') {
          high_volatility_count++;
        }
      } else {
        suppressed++;
      }
    }
  }
  
  return { generated, suppressed, high_volatility_count };
}

// ============================================================================
// PRODUCT VOLATILITY FORECAST
// ============================================================================

async function generateProductVolatilityForecast(
  product_id: string
): Promise<PriceVolatilityForecast | null> {
  // Get price history
  const { data: priceHistory } = await supabaseAdmin
    .from('price_history')
    .select('price, recorded_at')
    .eq('product_id', product_id)
    .gte('recorded_at', new Date(Date.now() - VOLATILITY_CONFIG.comparison_window_days * 24 * 60 * 60 * 1000).toISOString())
    .order('recorded_at', { ascending: true });
    
  const sample_size = priceHistory?.length || 0;
  
  // Insufficient data check
  if (sample_size < VOLATILITY_CONFIG.min_price_points) {
    return createInsufficientSignalForecast(product_id, sample_size);
  }
  
  // Calculate volatility metrics
  const prices = priceHistory!.map(p => Number(p.price));
  const recentPrices = prices.slice(-Math.ceil(prices.length / 2));
  const previousPrices = prices.slice(0, Math.floor(prices.length / 2));
  
  // Coefficient of variation
  const recentCV = calculateCV(recentPrices);
  const previousCV = calculateCV(previousPrices);
  const overallCV = calculateCV(prices);
  
  // Count price swings (direction changes)
  const swingCount = countPriceSwings(prices);
  
  // Get anomaly count - require recency to avoid treating old one-off anomalies as trends
  const { data: anomalies } = await supabaseAdmin
    .from('ai_pricing_analysis')
    .select('id, created_at')
    .eq('canonical_product_id', product_id)
    .eq('is_suspicious', true)
    .gte('created_at', new Date(Date.now() - VOLATILITY_CONFIG.window_days * 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false });
  
  // Count only recent anomalies (within anomaly_recency_days) and require spread
  // to distinguish recurring patterns from one-time spikes
  const recentCutoff = Date.now() - VOLATILITY_CONFIG.anomaly_recency_days * 24 * 60 * 60 * 1000;
  const recentAnomalies = anomalies?.filter(a => 
    new Date(a.created_at).getTime() > recentCutoff
  ) || [];
  
  // Check if anomalies are spread across multiple days (not just duplicates from same import)
  const anomalyDays = new Set(recentAnomalies.map(a => 
    new Date(a.created_at).toISOString().split('T')[0]
  ));
  const anomalyCount = anomalyDays.size >= 2 ? recentAnomalies.length : Math.floor(recentAnomalies.length / 2);
  
  // Get spread info
  const spread = prices.length > 0 
    ? (Math.max(...prices) - Math.min(...prices)) / Math.min(...prices) 
    : 0;
    
  // Get low-trust offer count
  const { data: lowTrustOffers } = await supabaseAdmin
    .from('offer_trust_scores')
    .select('id')
    .eq('product_id', product_id)
    .in('trust_band', ['low_trust', 'review_sensitive'])
    .gte('calculated_at', new Date(Date.now() - VOLATILITY_CONFIG.window_days * 24 * 60 * 60 * 1000).toISOString());
    
  const lowTrustCount = lowTrustOffers?.length || 0;
  
  // Determine volatility band and direction
  let volatility_band: VolatilityBand = 'stable';
  let predicted_direction: VolatilityDirection = 'stable';
  let volatility_score = overallCV;
  
  // Is volatility increasing?
  const cvDelta = recentCV - previousCV;
  if (cvDelta > 0.05) {
    predicted_direction = 'increasing';
  } else if (cvDelta < -0.05) {
    predicted_direction = 'decreasing';
  }
  
  // Determine band
  if (overallCV >= VOLATILITY_CONFIG.high_cv_threshold || 
      (anomalyCount >= VOLATILITY_CONFIG.anomaly_threshold && swingCount >= VOLATILITY_CONFIG.swing_count_threshold)) {
    volatility_band = 'high_volatility';
    volatility_score = Math.min(1, overallCV * 2);
  } else if (overallCV >= VOLATILITY_CONFIG.elevated_cv_threshold || anomalyCount >= 2) {
    volatility_band = 'elevated';
    volatility_score = overallCV;
  }
  
  // Confidence based on data quality
  const confidence = calculateVolatilityConfidence(sample_size, anomalyCount, lowTrustCount);
  
  // Generate reasoning
  const reasoning = generateVolatilityReasoning(
    overallCV,
    cvDelta,
    swingCount,
    anomalyCount,
    spread,
    sample_size
  );
  
  return {
    product_id,
    volatility_score,
    volatility_band,
    predicted_direction,
    predicted_risk: generateRiskDescription(volatility_band, predicted_direction),
    reasoning,
    evidence: {
      price_points: sample_size,
      spread_recent: recentPrices.length > 0 
        ? (Math.max(...recentPrices) - Math.min(...recentPrices)) / Math.min(...recentPrices) 
        : 0,
      spread_previous: previousPrices.length > 0 
        ? (Math.max(...previousPrices) - Math.min(...previousPrices)) / Math.min(...previousPrices) 
        : 0,
      anomaly_count: anomalyCount,
      swing_count: swingCount,
      low_trust_offers: lowTrustCount,
      coefficient_of_variation: overallCV,
    },
    window_days: VOLATILITY_CONFIG.comparison_window_days,
    sample_size,
    confidence,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function calculateCV(values: number[]): number {
  if (values.length < 2) return 0;
  
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 0;
  
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  const stdDev = Math.sqrt(variance);
  
  return stdDev / mean;
}

function countPriceSwings(prices: number[]): number {
  if (prices.length < 3) return 0;
  
  let swings = 0;
  let lastDirection = 0; // -1 = down, 1 = up, 0 = initial
  
  for (let i = 1; i < prices.length; i++) {
    const delta = prices[i] - prices[i - 1];
    const currentDirection = delta > 0 ? 1 : delta < 0 ? -1 : 0;
    
    if (currentDirection !== 0 && lastDirection !== 0 && currentDirection !== lastDirection) {
      swings++;
    }
    
    if (currentDirection !== 0) {
      lastDirection = currentDirection;
    }
  }
  
  return swings;
}

function calculateVolatilityConfidence(
  sample_size: number,
  anomaly_count: number,
  low_trust_count: number
): number {
  // Base confidence from sample size
  let confidence = Math.min(1, sample_size / 20);
  
  // Reduce confidence if high anomaly count (could be noise)
  if (anomaly_count > 3) {
    confidence *= 0.8;
  }
  
  // Reduce confidence if many low-trust offers (unreliable signals)
  if (low_trust_count > 2) {
    confidence *= 0.9;
  }
  
  return Math.max(0, Math.min(1, confidence));
}

function generateVolatilityReasoning(
  cv: number,
  cvDelta: number,
  swings: number,
  anomalies: number,
  spread: number,
  samples: number
): string {
  const parts: string[] = [];
  
  parts.push(`Price variability ${(cv * 100).toFixed(1)}% (coefficient of variation)`);
  
  if (cvDelta > 0.05) {
    parts.push(`volatility increasing`);
  } else if (cvDelta < -0.05) {
    parts.push(`volatility decreasing`);
  }
  
  if (swings >= VOLATILITY_CONFIG.swing_count_threshold) {
    parts.push(`${swings} price direction changes`);
  }
  
  if (anomalies >= VOLATILITY_CONFIG.anomaly_threshold) {
    parts.push(`${anomalies} pricing anomalies detected`);
  }
  
  if (spread > 0.3) {
    parts.push(`wide price spread (${(spread * 100).toFixed(0)}%)`);
  }
  
  parts.push(`based on ${samples} observations`);
  
  return parts.join(', ');
}

function generateRiskDescription(
  band: VolatilityBand,
  direction: VolatilityDirection
): string {
  if (band === 'high_volatility' && direction === 'increasing') {
    return 'Significant pricing instability - recommendations may become unreliable';
  }
  if (band === 'high_volatility') {
    return 'High price volatility - consider monitoring and verification before decisions';
  }
  if (band === 'elevated' && direction === 'increasing') {
    return 'Volatility trending upward - watch for continued instability';
  }
  if (band === 'elevated') {
    return 'Moderate volatility - current recommendations may shift';
  }
  return 'Price stability acceptable';
}

function createInsufficientSignalForecast(
  product_id: string,
  sample_size: number
): PriceVolatilityForecast {
  return {
    product_id,
    volatility_score: 0,
    volatility_band: 'low_signal',
    predicted_direction: 'insufficient_signal',
    predicted_risk: 'Insufficient data for volatility assessment',
    reasoning: `Only ${sample_size} price points available; minimum ${VOLATILITY_CONFIG.min_price_points} required`,
    evidence: { price_points: sample_size },
    window_days: VOLATILITY_CONFIG.window_days,
    sample_size,
    confidence: 0,
  };
}

// ============================================================================
// PERSISTENCE
// ============================================================================

async function persistVolatilityForecast(forecast: PriceVolatilityForecast): Promise<void> {
  await supabaseAdmin
    .from('price_volatility_forecasts')
    .insert({
      product_id: forecast.product_id,
      offer_id: forecast.offer_id,
      volatility_score: forecast.volatility_score,
      volatility_band: forecast.volatility_band,
      predicted_direction: forecast.predicted_direction,
      predicted_risk: forecast.predicted_risk,
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

export async function getProductVolatilityForecast(
  product_id: string
): Promise<PriceVolatilityForecast | null> {
  const { data } = await supabaseAdmin
    .from('price_volatility_forecasts')
    .select('*')
    .eq('product_id', product_id)
    .order('forecast_as_of', { ascending: false })
    .limit(1)
    .single();
    
  if (!data) return null;
  
  return {
    product_id: data.product_id,
    offer_id: data.offer_id,
    volatility_score: Number(data.volatility_score),
    volatility_band: data.volatility_band as VolatilityBand,
    predicted_direction: data.predicted_direction as VolatilityDirection,
    predicted_risk: data.predicted_risk,
    reasoning: data.reasoning,
    evidence: data.evidence as VolatilityEvidence,
    window_days: data.window_days,
    sample_size: data.sample_size,
    confidence: Number(data.confidence),
  };
}

export async function getProductsWithRisingVolatility(
  limit: number = 20
): Promise<PriceVolatilityForecast[]> {
  const { data } = await supabaseAdmin
    .from('products_rising_volatility')
    .select('*')
    .limit(limit);
    
  if (!data) return [];
  
  return data.map(d => ({
    product_id: d.product_id,
    volatility_score: Number(d.volatility_score),
    volatility_band: d.volatility_band as VolatilityBand,
    predicted_direction: d.predicted_direction as VolatilityDirection,
    predicted_risk: d.predicted_risk || '',
    reasoning: d.reasoning,
    evidence: {},
    window_days: VOLATILITY_CONFIG.window_days,
    sample_size: d.sample_size,
    confidence: Number(d.confidence),
  }));
}
