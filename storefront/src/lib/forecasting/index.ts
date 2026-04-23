/**
 * Forecasting and Commercial Guidance Module
 * 
 * Provides forward-looking predictions and commercial recommendations.
 */

// Supplier Forecasting
export {
  generateSupplierForecasts,
  getSupplierForecasts,
  getSuppliersLikelyToDeteriorate,
  type ForecastType,
  type ForecastBand,
  type PredictedDirection,
  type SupplierForecast,
  type ForecastEvidence,
} from './supplierForecasting';

// Price Volatility
export {
  generatePriceVolatilityForecasts,
  getProductVolatilityForecast,
  getProductsWithRisingVolatility,
  type VolatilityBand,
  type VolatilityDirection,
  type PriceVolatilityForecast,
  type VolatilityEvidence,
} from './priceVolatility';

// Commercial Guidance
export {
  generateCommercialGuidanceRecommendations,
  acknowledgeGuidance,
  actionGuidance,
  dismissGuidance,
  getUrgentGuidance,
  getAllActiveGuidance,
  getGuidanceStats,
  type GuidanceType,
  type GuidanceBand,
  type GuidanceStatus,
  type CommercialGuidance,
  type GuidanceEvidence,
} from './commercialGuidance';

// Commercial Risk
export {
  calculateCommercialRiskScores,
  getCommercialRiskLeaderboard,
  getWeaklyCoveredProducts,
  getProductRisk,
  type RiskBand,
  type DataQuality,
  type CommercialRiskScore,
  type RiskEvidence,
} from './commercialRisk';

// Forecast Metrics
export {
  calculateForecastQualityMetrics,
  generateForecastQualityReport,
  getForecastMetricTrend,
  type ForecastMetricType,
  type ForecastMetric,
  type ForecastQualityReport,
} from './forecastMetrics';

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

import { generateSupplierForecasts } from './supplierForecasting';
import { generatePriceVolatilityForecasts } from './priceVolatility';
import { generateCommercialGuidanceRecommendations } from './commercialGuidance';
import { calculateCommercialRiskScores } from './commercialRisk';
import { calculateForecastQualityMetrics } from './forecastMetrics';
import { supabaseAdmin } from '../jobs/supabase';

/**
 * Run full forecasting cycle
 * Call during nightly jobs
 */
export async function runForecastingCycle(): Promise<{
  supplier_forecasts_generated: number;
  volatility_forecasts_generated: number;
  guidance_generated: number;
  risk_scores_calculated: number;
  metrics_calculated: number;
  forecasts_cleaned: number;
}> {
  // 1. Generate supplier forecasts
  const supplierResult = await generateSupplierForecasts();
  
  // 2. Generate price volatility forecasts
  const volatilityResult = await generatePriceVolatilityForecasts();
  
  // 3. Generate commercial guidance
  const guidanceResult = await generateCommercialGuidanceRecommendations();
  
  // 4. Calculate commercial risk scores
  const riskResult = await calculateCommercialRiskScores();
  
  // 5. Calculate forecast quality metrics
  const metrics = await calculateForecastQualityMetrics(30);
  
  // 6. Clean up old forecasts
  const { data: cleanupResult } = await supabaseAdmin.rpc('cleanup_old_forecasts', {
    p_retention_days: 90,
  });
  
  const cleaned = cleanupResult?.[0] || { 
    supplier_forecasts_deleted: 0, 
    price_forecasts_deleted: 0,
    guidance_expired: 0,
  };
  
  return {
    supplier_forecasts_generated: supplierResult.generated,
    volatility_forecasts_generated: volatilityResult.generated,
    guidance_generated: guidanceResult.generated,
    risk_scores_calculated: riskResult.calculated,
    metrics_calculated: metrics.length,
    forecasts_cleaned: (cleaned.supplier_forecasts_deleted || 0) + 
      (cleaned.price_forecasts_deleted || 0) + 
      (cleaned.guidance_expired || 0),
  };
}
