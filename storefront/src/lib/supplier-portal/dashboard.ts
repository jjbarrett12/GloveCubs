/**
 * Supplier Portal Dashboard Data
 * 
 * Provides dashboard metrics and insights for suppliers.
 * All queries are supplier_id scoped.
 */

import { supabaseAdmin } from '../jobs/supabase';
import { fetchCatalogProductNamesByIds } from '../catalog/v2-ingestion-catalog';
import { logAuditEvent } from './auth';

// ============================================================================
// TYPES
// ============================================================================

export interface DashboardSummary {
  supplier_id: string;
  supplier_name: string;
  reliability: {
    score: number;
    band: string;
    trend: 'improving' | 'stable' | 'declining';
  };
  trust: {
    avg_score: number;
    high_trust_count: number;
    low_trust_count: number;
  };
  offers: {
    total: number;
    active: number;
    stale: number;
    fresh: number;
  };
  competitiveness: {
    avg_rank: number;
    rank_1_count: number;
    price_percentile: number;
  };
  alerts: {
    unread: number;
    critical: number;
  };
}

export interface OfferHealth {
  offer_id: string;
  product_id: string;
  product_name?: string;
  price: number;
  days_since_update: number;
  freshness_status: 'fresh' | 'aging' | 'stale';
  trust_score: number | null;
  trust_band: string | null;
  recommendation_rank: number | null;
  price_vs_market: {
    percentile: number;
    avg_price: number;
    min_price: number;
  } | null;
}

export interface CompetitivenessInsight {
  product_id: string;
  product_name?: string;
  supplier_price: number;
  market_avg: number;
  market_min: number;
  price_percentile: number;
  recommendation_rank: number;
  recommendation_band: string;
  trust_score: number | null;
}

export interface FeedHealthMetrics {
  completeness_score: number;
  accuracy_rate: number;
  anomaly_count: number;
  correction_count: number;
  missing_fields: string[];
  recent_anomalies: Array<{
    type: string;
    product_id: string;
    detected_at: string;
  }>;
}

// ============================================================================
// DASHBOARD SUMMARY
// ============================================================================

export async function getDashboardSummary(
  supplier_id: string
): Promise<DashboardSummary | null> {
  // Get supplier info
  const { data: supplier } = await supabaseAdmin
    .from('suppliers')
    .select('id, name')
    .eq('id', supplier_id)
    .single();
    
  if (!supplier) return null;
  
  // Get reliability scores (last 2 for trend)
  const { data: reliabilityScores } = await supabaseAdmin
    .from('supplier_reliability_scores')
    .select('reliability_score, reliability_band, calculated_at')
    .eq('supplier_id', supplier_id)
    .order('calculated_at', { ascending: false })
    .limit(2);
    
  const currentReliability = reliabilityScores?.[0];
  const previousReliability = reliabilityScores?.[1];
  
  let reliabilityTrend: 'improving' | 'stable' | 'declining' = 'stable';
  if (currentReliability && previousReliability) {
    const delta = Number(currentReliability.reliability_score) - Number(previousReliability.reliability_score);
    if (delta > 0.05) reliabilityTrend = 'improving';
    else if (delta < -0.05) reliabilityTrend = 'declining';
  }
  
  // Get trust scores
  const { data: trustScores } = await supabaseAdmin
    .from('offer_trust_scores')
    .select('trust_score, trust_band')
    .eq('supplier_id', supplier_id)
    .gte('calculated_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
    
  const avgTrust = trustScores && trustScores.length > 0
    ? trustScores.reduce((sum, t) => sum + Number(t.trust_score), 0) / trustScores.length
    : 0;
  const highTrustCount = trustScores?.filter(t => t.trust_band === 'high_trust').length || 0;
  const lowTrustCount = trustScores?.filter(t => t.trust_band === 'low_trust').length || 0;
  
  // Get offer counts
  const { data: offers } = await supabaseAdmin
    .from('supplier_offers')
    .select('id, is_active, updated_at')
    .eq('supplier_id', supplier_id);
    
  const now = Date.now();
  const activeOffers = offers?.filter(o => o.is_active) || [];
  const staleOffers = activeOffers.filter(o => 
    (now - new Date(o.updated_at).getTime()) > 30 * 24 * 60 * 60 * 1000
  );
  const freshOffers = activeOffers.filter(o => 
    (now - new Date(o.updated_at).getTime()) < 7 * 24 * 60 * 60 * 1000
  );
  
  // Get recommendation stats
  const { data: recommendations } = await supabaseAdmin
    .from('supplier_recommendations')
    .select('recommended_rank')
    .eq('supplier_id', supplier_id)
    .gte('calculated_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
    
  const avgRank = recommendations && recommendations.length > 0
    ? recommendations.reduce((sum, r) => sum + r.recommended_rank, 0) / recommendations.length
    : 0;
  const rank1Count = recommendations?.filter(r => r.recommended_rank === 1).length || 0;
  
  // Get alerts
  const { data: alerts } = await supabaseAdmin
    .from('supplier_portal_alerts')
    .select('severity, is_read')
    .eq('supplier_id', supplier_id)
    .eq('is_dismissed', false);
    
  const unreadAlerts = alerts?.filter(a => !a.is_read).length || 0;
  const criticalAlerts = alerts?.filter(a => a.severity === 'critical' && !a.is_read).length || 0;
  
  return {
    supplier_id,
    supplier_name: supplier.name,
    reliability: {
      score: currentReliability ? Number(currentReliability.reliability_score) : 0,
      band: currentReliability?.reliability_band || 'unknown',
      trend: reliabilityTrend,
    },
    trust: {
      avg_score: avgTrust,
      high_trust_count: highTrustCount,
      low_trust_count: lowTrustCount,
    },
    offers: {
      total: offers?.length || 0,
      active: activeOffers.length,
      stale: staleOffers.length,
      fresh: freshOffers.length,
    },
    competitiveness: {
      avg_rank: avgRank,
      rank_1_count: rank1Count,
      price_percentile: 50, // Calculated separately
    },
    alerts: {
      unread: unreadAlerts,
      critical: criticalAlerts,
    },
  };
}

// ============================================================================
// OFFER HEALTH
// ============================================================================

export async function getOfferHealth(
  supplier_id: string,
  limit: number = 50
): Promise<OfferHealth[]> {
  const { data: offers } = await supabaseAdmin
    .from('supplier_offer_health')
    .select('*')
    .eq('supplier_id', supplier_id)
    .order('days_since_update', { ascending: false })
    .limit(limit);
    
  if (!offers) return [];

  const nameByProduct = await fetchCatalogProductNamesByIds(
    offers.map((o) => String(o.product_id))
  );

  // Enrich with product names and market data
  const enriched: OfferHealth[] = [];

  for (const offer of offers) {
    // Get market pricing
    const { data: marketPrices } = await supabaseAdmin
      .from('supplier_offers')
      .select('price')
      .eq('product_id', offer.product_id)
      .eq('is_active', true);
      
    let priceVsMarket = null;
    if (marketPrices && marketPrices.length > 0) {
      const prices = marketPrices.map(p => Number(p.price));
      const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
      const minPrice = Math.min(...prices);
      const supplierPrice = Number(offer.price);
      const belowCount = prices.filter(p => p < supplierPrice).length;
      
      priceVsMarket = {
        percentile: (belowCount / prices.length) * 100,
        avg_price: avgPrice,
        min_price: minPrice,
      };
    }
    
    // Get recommendation rank
    const { data: rec } = await supabaseAdmin
      .from('supplier_recommendations')
      .select('recommended_rank')
      .eq('supplier_id', supplier_id)
      .eq('product_id', offer.product_id)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .single();
      
    enriched.push({
      offer_id: offer.offer_id,
      product_id: offer.product_id,
      product_name: nameByProduct.get(String(offer.product_id)),
      price: Number(offer.price),
      days_since_update: Math.floor(offer.days_since_update),
      freshness_status: offer.freshness_status as 'fresh' | 'aging' | 'stale',
      trust_score: offer.trust_score ? Number(offer.trust_score) : null,
      trust_band: offer.trust_band,
      recommendation_rank: rec?.recommended_rank || null,
      price_vs_market: priceVsMarket,
    });
  }
  
  return enriched;
}

// ============================================================================
// COMPETITIVENESS INSIGHTS
// ============================================================================

export async function getCompetitivenessInsights(
  supplier_id: string,
  limit: number = 30
): Promise<CompetitivenessInsight[]> {
  const { data: competitiveness } = await supabaseAdmin
    .from('supplier_competitiveness')
    .select('*')
    .eq('supplier_id', supplier_id)
    .order('recommendation_score', { ascending: false })
    .limit(limit);
    
  if (!competitiveness) return [];

  const competitivenessNameMap = await fetchCatalogProductNamesByIds(
    competitiveness.map((c) => String(c.product_id))
  );

  const insights: CompetitivenessInsight[] = [];

  for (const c of competitiveness) {
    // Get price percentile
    const { data: percentileData } = await supabaseAdmin.rpc('get_supplier_price_percentile', {
      p_supplier_id: supplier_id,
      p_product_id: c.product_id,
    });
    
    // Get trust score
    const { data: trust } = await supabaseAdmin
      .from('offer_trust_scores')
      .select('trust_score')
      .eq('supplier_id', supplier_id)
      .eq('product_id', c.product_id)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .single();
      
    insights.push({
      product_id: c.product_id,
      product_name: competitivenessNameMap.get(String(c.product_id)),
      supplier_price: Number(c.supplier_price),
      market_avg: Number(c.market_avg_price),
      market_min: Number(c.market_min_price),
      price_percentile: percentileData || 50,
      recommendation_rank: c.recommended_rank,
      recommendation_band: c.recommendation_band,
      trust_score: trust ? Number(trust.trust_score) : null,
    });
  }
  
  return insights;
}

// ============================================================================
// RANK DISTRIBUTION
// ============================================================================

export async function getRankDistribution(
  supplier_id: string,
  window_days: number = 30
): Promise<Array<{ rank: number; count: number; percentage: number }>> {
  const { data } = await supabaseAdmin.rpc('get_supplier_rank_distribution', {
    p_supplier_id: supplier_id,
    p_window_days: window_days,
  });
  
  if (!data) return [];
  
  return data.map((d: { rank_position: number; count: number; percentage: number }) => ({
    rank: d.rank_position,
    count: Number(d.count),
    percentage: Number(d.percentage),
  }));
}

// ============================================================================
// FEED HEALTH
// ============================================================================

export async function getFeedHealthMetrics(
  supplier_id: string
): Promise<FeedHealthMetrics> {
  // Get reliability sub-scores
  const { data: reliability } = await supabaseAdmin
    .from('supplier_reliability_scores')
    .select('completeness_score, accuracy_score')
    .eq('supplier_id', supplier_id)
    .order('calculated_at', { ascending: false })
    .limit(1)
    .single();
    
  // Get anomaly count
  const { data: anomalies } = await supabaseAdmin
    .from('ai_pricing_analysis')
    .select('id, analysis_type, canonical_product_id, created_at')
    .eq('supplier_id', supplier_id)
    .eq('is_suspicious', true)
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(10);
    
  // Get correction count
  const { data: corrections } = await supabaseAdmin
    .from('ai_feedback')
    .select('id')
    .eq('supplier_id', supplier_id)
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
    
  // Check for missing required fields
  const { data: offers } = await supabaseAdmin
    .from('supplier_offers')
    .select('case_pack, box_quantity, lead_time_days, moq')
    .eq('supplier_id', supplier_id)
    .eq('is_active', true);
    
  const missingFields: string[] = [];
  if (offers) {
    const missingCasePack = offers.filter(o => !o.case_pack).length;
    const missingBoxQty = offers.filter(o => !o.box_quantity).length;
    const missingLeadTime = offers.filter(o => !o.lead_time_days).length;
    const missingMoq = offers.filter(o => !o.moq).length;
    
    if (missingCasePack > offers.length * 0.2) missingFields.push('case_pack');
    if (missingBoxQty > offers.length * 0.2) missingFields.push('box_quantity');
    if (missingLeadTime > offers.length * 0.2) missingFields.push('lead_time');
    if (missingMoq > offers.length * 0.2) missingFields.push('moq');
  }
  
  return {
    completeness_score: reliability ? Number(reliability.completeness_score) : 0,
    accuracy_rate: reliability ? Number(reliability.accuracy_score) : 0,
    anomaly_count: anomalies?.length || 0,
    correction_count: corrections?.length || 0,
    missing_fields: missingFields,
    recent_anomalies: (anomalies || []).map(a => ({
      type: a.analysis_type,
      product_id: a.canonical_product_id,
      detected_at: a.created_at,
    })),
  };
}

// ============================================================================
// REJECTED RECOMMENDATIONS
// ============================================================================

export async function getRejectedRecommendationStats(
  supplier_id: string,
  window_days: number = 30
): Promise<{
  total_recommendations: number;
  accepted: number;
  rejected: number;
  overridden: number;
  rejection_rate: number;
  override_rate: number;
  common_rejection_reasons: Array<{ reason: string; count: number }>;
}> {
  const { data: outcomes } = await supabaseAdmin
    .from('recommendation_outcomes')
    .select('outcome_status, rejection_reason, selected_supplier_id, supplier_id')
    .eq('supplier_id', supplier_id)
    .gte('created_at', new Date(Date.now() - window_days * 24 * 60 * 60 * 1000).toISOString());
    
  if (!outcomes || outcomes.length === 0) {
    return {
      total_recommendations: 0,
      accepted: 0,
      rejected: 0,
      overridden: 0,
      rejection_rate: 0,
      override_rate: 0,
      common_rejection_reasons: [],
    };
  }
  
  const accepted = outcomes.filter(o => o.outcome_status === 'accepted').length;
  const rejected = outcomes.filter(o => o.outcome_status === 'rejected').length;
  const overridden = outcomes.filter(o => 
    o.outcome_status === 'accepted' && 
    o.selected_supplier_id && 
    o.selected_supplier_id !== o.supplier_id
  ).length;
  
  // Count rejection reasons
  const reasonCounts: Record<string, number> = {};
  for (const o of outcomes) {
    if (o.rejection_reason) {
      reasonCounts[o.rejection_reason] = (reasonCounts[o.rejection_reason] || 0) + 1;
    }
  }
  
  const common_rejection_reasons = Object.entries(reasonCounts)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
    
  return {
    total_recommendations: outcomes.length,
    accepted,
    rejected,
    overridden,
    rejection_rate: rejected / outcomes.length,
    override_rate: overridden / outcomes.length,
    common_rejection_reasons,
  };
}
