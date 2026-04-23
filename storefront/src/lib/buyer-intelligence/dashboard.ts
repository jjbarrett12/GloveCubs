/**
 * Buyer Intelligence Dashboard Service
 * 
 * Aggregates intelligence data for institutional customers:
 * - Savings analytics
 * - Market intelligence
 * - Supplier trust comparison
 * - Procurement risk alerts
 * - Spend analytics
 * - Opportunity engine
 */

import { supabaseAdmin, getSupabaseCatalogos } from '../jobs/supabase';

async function catalogProductNameMap(ids: string[]): Promise<Map<string, string>> {
  const uniq = Array.from(new Set(ids.filter((x) => typeof x === 'string' && x.length > 0))).slice(0, 400);
  if (uniq.length === 0) return new Map();
  const { data } = await getSupabaseCatalogos()
    .from('products')
    .select('id, name')
    .in('id', uniq)
    .eq('is_active', true);
  return new Map((data ?? []).map((r: { id: string; name: string }) => [r.id, r.name]));
}

// ============================================================================
// TYPES
// ============================================================================

export interface BuyerProfile {
  id: string;
  name: string;
  type: 'hospital' | 'school' | 'food_processor' | 'manufacturer' | 'janitorial' | 'other';
  facilities: string[];
  departments: string[];
}

export interface SavingsSummary {
  quarter: {
    total: number;
    by_supplier_switch: number;
    by_better_offers: number;
    by_anomaly_detection: number;
    by_rebid: number;
  };
  ytd: {
    total: number;
    by_supplier_switch: number;
    by_better_offers: number;
    by_anomaly_detection: number;
    by_rebid: number;
  };
  pipeline: number;
  realized: number;
  trend: Array<{ month: string; savings: number }>;
}

export interface MarketIntelligence {
  product_id: string;
  product_name: string;
  market_low: number;
  market_high: number;
  market_avg: number;
  trusted_best_price: number;
  trusted_best_supplier: string;
  suspicious_low_count: number;
  volatility_band: 'stable' | 'elevated' | 'high_volatility' | 'low_signal';
  price_distribution: Array<{
    supplier_id: string;
    supplier_name: string;
    price: number;
    trust_band: string;
    is_recommended: boolean;
  }>;
}

export interface SupplierComparison {
  supplier_id: string;
  supplier_name: string;
  price: number;
  price_vs_market: number;
  trust_score: number;
  trust_band: string;
  reliability_score: number;
  reliability_band: string;
  offer_freshness_days: number;
  freshness_status: 'fresh' | 'aging' | 'stale';
  recommendation_rank: number;
  is_recommended: boolean;
  recommendation_reasons: string[];
}

export interface ProcurementRisk {
  id: string;
  type: 'supplier_decline' | 'price_volatility' | 'stale_offer' | 'margin_compression' | 'coverage_gap';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  affected_products: number;
  affected_spend: number;
  recommended_action: string;
  entity_id?: string;
  entity_name?: string;
  created_at: string;
}

export interface SpendAnalytics {
  total_spend: number;
  period_spend: number;
  by_facility: Array<{ facility: string; spend: number; percentage: number }>;
  by_product: Array<{ product_id: string; product_name: string; spend: number; percentage: number }>;
  by_supplier: Array<{ supplier_id: string; supplier_name: string; spend: number; percentage: number }>;
  trend: Array<{ period: string; spend: number }>;
  avg_order_value: number;
  order_count: number;
}

export interface SavingsOpportunity {
  id: string;
  type: 'supplier_switch' | 'rebid' | 'consolidate' | 'renegotiate';
  priority: 'high' | 'medium' | 'low';
  product_id: string;
  product_name: string;
  current_supplier: string;
  current_price: number;
  recommended_supplier?: string;
  recommended_price?: number;
  estimated_savings: number;
  savings_percentage: number;
  confidence: number;
  reasoning: string[];
  risk_factors: string[];
}

export interface SupplierRiskForecast {
  supplier_id: string;
  supplier_name: string;
  current_reliability: number;
  forecasted_reliability: number;
  forecast_direction: 'improving' | 'stable' | 'declining';
  risk_band: 'low' | 'moderate' | 'high' | 'critical';
  affected_products: number;
  affected_spend: number;
  reasoning: string;
  recommended_action: string;
}

export interface AIExplanation {
  recommendation_id: string;
  product_id: string;
  product_name: string;
  recommended_supplier: string;
  recommendation_type: string;
  trust_reasoning: string[];
  price_reasoning: string[];
  risk_indicators: string[];
  confidence_factors: string[];
  alternative_options: Array<{
    supplier: string;
    price: number;
    trade_offs: string[];
  }>;
}

// ============================================================================
// SAVINGS SUMMARY
// ============================================================================

export async function getSavingsSummary(buyer_id: string): Promise<SavingsSummary> {
  const now = new Date();
  const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  
  // Get realized savings from recommendation outcomes
  const { data: outcomes } = await supabaseAdmin
    .from('recommendation_outcomes')
    .select('realized_savings, estimated_savings, outcome_status, savings_source, created_at')
    .eq('buyer_id', buyer_id)
    .gte('created_at', yearStart.toISOString());
    
  const quarterOutcomes = outcomes?.filter(o => 
    new Date(o.created_at) >= quarterStart
  ) || [];
  
  const ytdOutcomes = outcomes || [];
  
  // Calculate savings by source
  const calculateSavingsBySource = (items: typeof outcomes) => {
    const result = {
      total: 0,
      by_supplier_switch: 0,
      by_better_offers: 0,
      by_anomaly_detection: 0,
      by_rebid: 0,
    };
    
    if (!items) return result;
    
    for (const item of items) {
      if (item.outcome_status !== 'accepted') continue;
      const savings = Number(item.realized_savings || item.estimated_savings || 0);
      result.total += savings;
      
      switch (item.savings_source) {
        case 'supplier_switch':
          result.by_supplier_switch += savings;
          break;
        case 'better_offer':
          result.by_better_offers += savings;
          break;
        case 'anomaly_correction':
          result.by_anomaly_detection += savings;
          break;
        case 'rebid':
          result.by_rebid += savings;
          break;
        default:
          result.by_better_offers += savings;
      }
    }
    
    return result;
  };
  
  // Get pipeline savings (pending opportunities)
  const { data: opportunities } = await supabaseAdmin
    .from('margin_opportunities')
    .select('estimated_savings')
    .eq('buyer_id', buyer_id)
    .eq('status', 'pending');
    
  const pipeline = opportunities?.reduce((sum, o) => sum + Number(o.estimated_savings || 0), 0) || 0;
  
  // Get realized savings total
  const realized = ytdOutcomes
    .filter(o => o.outcome_status === 'accepted')
    .reduce((sum, o) => sum + Number(o.realized_savings || 0), 0);
    
  // Calculate monthly trend
  const trend: Array<{ month: string; savings: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    
    const monthSavings = ytdOutcomes
      .filter(o => {
        const date = new Date(o.created_at);
        return date >= monthStart && date <= monthEnd && o.outcome_status === 'accepted';
      })
      .reduce((sum, o) => sum + Number(o.realized_savings || 0), 0);
      
    trend.push({
      month: monthStart.toLocaleDateString('en-US', { month: 'short' }),
      savings: monthSavings,
    });
  }
  
  return {
    quarter: calculateSavingsBySource(quarterOutcomes),
    ytd: calculateSavingsBySource(ytdOutcomes),
    pipeline,
    realized,
    trend,
  };
}

// ============================================================================
// MARKET INTELLIGENCE
// ============================================================================

export async function getMarketIntelligence(
  buyer_id: string,
  product_ids?: string[]
): Promise<MarketIntelligence[]> {
  const catalogIds = new Set<string>();
  const { data: rawOrders } = await supabaseAdmin
    .schema('gc_commerce')
    .from('orders')
    .select(`id, order_lines(quantity, product_snapshot)`)
    .eq('placed_by_user_id', buyer_id)
    .limit(80);

  for (const o of rawOrders ?? []) {
    const lines = (o as { order_lines?: { product_snapshot?: Record<string, unknown> | null }[] | null })
      .order_lines;
    for (const line of lines ?? []) {
      const snap = line.product_snapshot;
      const cid = (snap?.catalog_product_id ?? snap?.canonical_product_id) as string | undefined;
      if (cid && typeof cid === 'string') catalogIds.add(cid);
    }
  }

  let seedIds = Array.from(catalogIds).slice(0, 50);
  if (product_ids?.length) {
    const allow = new Set(product_ids);
    seedIds = seedIds.filter((id) => allow.has(id));
    if (seedIds.length === 0) seedIds = product_ids.slice(0, 50);
  }

  if (seedIds.length === 0) {
    const { data: products } = await getSupabaseCatalogos()
      .from('products')
      .select('id, name')
      .eq('is_active', true)
      .limit(20);
    if (!products?.length) return [];
    const results: MarketIntelligence[] = [];
    for (const product of products) {
      const intel = await getProductMarketIntelligence(product.id as string, product.name as string);
      if (intel) results.push(intel);
    }
    return results;
  }

  const nameMap = await catalogProductNameMap(seedIds);
  const results: MarketIntelligence[] = [];
  for (const productId of seedIds) {
    const productName = nameMap.get(productId) ?? 'Unknown';
    const intel = await getProductMarketIntelligence(productId, productName);
    if (intel) results.push(intel);
  }
  return results;
}

async function getProductMarketIntelligence(
  product_id: string,
  product_name: string
): Promise<MarketIntelligence | null> {
  // Get all active offers for product
  const { data: offers } = await supabaseAdmin
    .from('supplier_offers')
    .select(`
      id, supplier_id, price, updated_at,
      suppliers(id, name)
    `)
    .eq('product_id', product_id)
    .eq('is_active', true);
    
  if (!offers || offers.length === 0) return null;
  
  // Get trust scores
  const { data: trustScores } = await supabaseAdmin
    .from('offer_trust_scores')
    .select('supplier_id, trust_score, trust_band')
    .eq('product_id', product_id)
    .order('calculated_at', { ascending: false });
    
  const trustMap = new Map<string, { score: number; band: string }>();
  if (trustScores) {
    for (const t of trustScores) {
      if (!trustMap.has(t.supplier_id)) {
        trustMap.set(t.supplier_id, { score: Number(t.trust_score), band: t.trust_band });
      }
    }
  }
  
  // Get recommendation
  const { data: recommendation } = await supabaseAdmin
    .from('supplier_recommendations')
    .select('supplier_id, recommended_rank')
    .eq('product_id', product_id)
    .order('calculated_at', { ascending: false })
    .limit(5);
    
  const recommendedSupplier = recommendation?.find(r => r.recommended_rank === 1)?.supplier_id;
  
  // Get volatility
  const { data: volatility } = await supabaseAdmin
    .from('price_volatility_forecasts')
    .select('volatility_band')
    .eq('product_id', product_id)
    .order('forecast_as_of', { ascending: false })
    .limit(1)
    .single();
    
  // Calculate market stats
  const prices = offers.map(o => Number(o.price));
  const marketLow = Math.min(...prices);
  const marketHigh = Math.max(...prices);
  const marketAvg = prices.reduce((a, b) => a + b, 0) / prices.length;
  
  // Find trusted best price (high trust offers only)
  const trustedOffers = offers.filter(o => {
    const trust = trustMap.get(o.supplier_id);
    return trust && (trust.band === 'high_trust' || trust.band === 'medium_trust');
  });
  
  const trustedBest = trustedOffers.length > 0
    ? trustedOffers.reduce((best, o) => Number(o.price) < Number(best.price) ? o : best)
    : offers.reduce((best, o) => Number(o.price) < Number(best.price) ? o : best);
    
  // Count suspicious low prices
  const suspiciousLowCount = offers.filter(o => {
    const trust = trustMap.get(o.supplier_id);
    return trust && trust.band === 'low_trust' && Number(o.price) < marketAvg * 0.8;
  }).length;
  
  // Build price distribution
  const priceDistribution = offers.map(o => {
    const supplier = o.suppliers as unknown as { id: string; name: string } | null;
    const trust = trustMap.get(o.supplier_id);
    
    return {
      supplier_id: o.supplier_id,
      supplier_name: supplier?.name || 'Unknown',
      price: Number(o.price),
      trust_band: trust?.band || 'unknown',
      is_recommended: o.supplier_id === recommendedSupplier,
    };
  }).sort((a, b) => a.price - b.price);
  
  return {
    product_id,
    product_name,
    market_low: marketLow,
    market_high: marketHigh,
    market_avg: marketAvg,
    trusted_best_price: Number(trustedBest.price),
    trusted_best_supplier: (trustedBest.suppliers as unknown as { name: string } | null)?.name || 'Unknown',
    suspicious_low_count: suspiciousLowCount,
    volatility_band: (volatility?.volatility_band as MarketIntelligence['volatility_band']) || 'low_signal',
    price_distribution: priceDistribution,
  };
}

// ============================================================================
// SUPPLIER COMPARISON
// ============================================================================

export async function getSupplierComparison(
  buyer_id: string,
  product_id: string
): Promise<SupplierComparison[]> {
  // Get all offers for product
  const { data: offers } = await supabaseAdmin
    .from('supplier_offers')
    .select(`
      id, supplier_id, price, updated_at,
      suppliers(id, name)
    `)
    .eq('product_id', product_id)
    .eq('is_active', true);
    
  if (!offers || offers.length === 0) return [];
  
  const now = Date.now();
  const prices = offers.map(o => Number(o.price));
  const marketAvg = prices.reduce((a, b) => a + b, 0) / prices.length;
  
  // Get trust scores
  const { data: trustScores } = await supabaseAdmin
    .from('offer_trust_scores')
    .select('supplier_id, trust_score, trust_band')
    .eq('product_id', product_id)
    .order('calculated_at', { ascending: false });
    
  const trustMap = new Map<string, { score: number; band: string }>();
  if (trustScores) {
    for (const t of trustScores) {
      if (!trustMap.has(t.supplier_id)) {
        trustMap.set(t.supplier_id, { score: Number(t.trust_score), band: t.trust_band });
      }
    }
  }
  
  // Get reliability scores
  const supplierIds = offers.map(o => o.supplier_id);
  const { data: reliabilityScores } = await supabaseAdmin
    .from('supplier_reliability_scores')
    .select('supplier_id, reliability_score, reliability_band')
    .in('supplier_id', supplierIds)
    .order('calculated_at', { ascending: false });
    
  const reliabilityMap = new Map<string, { score: number; band: string }>();
  if (reliabilityScores) {
    for (const r of reliabilityScores) {
      if (!reliabilityMap.has(r.supplier_id)) {
        reliabilityMap.set(r.supplier_id, { score: Number(r.reliability_score), band: r.reliability_band });
      }
    }
  }
  
  // Get recommendations
  const { data: recommendations } = await supabaseAdmin
    .from('supplier_recommendations')
    .select('supplier_id, recommended_rank, recommendation_reasoning')
    .eq('product_id', product_id)
    .in('supplier_id', supplierIds)
    .order('calculated_at', { ascending: false });
    
  const recMap = new Map<string, { rank: number; reasons: string[] }>();
  if (recommendations) {
    for (const r of recommendations) {
      if (!recMap.has(r.supplier_id)) {
        recMap.set(r.supplier_id, {
          rank: r.recommended_rank,
          reasons: r.recommendation_reasoning || [],
        });
      }
    }
  }
  
  // Build comparison
  return offers.map(o => {
    const supplier = o.suppliers as unknown as { id: string; name: string } | null;
    const trust = trustMap.get(o.supplier_id);
    const reliability = reliabilityMap.get(o.supplier_id);
    const rec = recMap.get(o.supplier_id);
    
    const daysSinceUpdate = Math.floor((now - new Date(o.updated_at).getTime()) / (24 * 60 * 60 * 1000));
    const freshnessStatus: 'fresh' | 'aging' | 'stale' = 
      daysSinceUpdate <= 7 ? 'fresh' : daysSinceUpdate <= 30 ? 'aging' : 'stale';
    
    return {
      supplier_id: o.supplier_id,
      supplier_name: supplier?.name || 'Unknown',
      price: Number(o.price),
      price_vs_market: ((Number(o.price) - marketAvg) / marketAvg) * 100,
      trust_score: trust?.score || 0,
      trust_band: trust?.band || 'unknown',
      reliability_score: reliability?.score || 0,
      reliability_band: reliability?.band || 'unknown',
      offer_freshness_days: daysSinceUpdate,
      freshness_status: freshnessStatus,
      recommendation_rank: rec?.rank || 99,
      is_recommended: rec?.rank === 1,
      recommendation_reasons: rec?.reasons || [],
    };
  }).sort((a, b) => a.recommendation_rank - b.recommendation_rank);
}

// ============================================================================
// PROCUREMENT RISKS
// ============================================================================

export async function getProcurementRisks(buyer_id: string): Promise<ProcurementRisk[]> {
  const risks: ProcurementRisk[] = [];
  
  // Get procurement alerts
  const { data: alerts } = await supabaseAdmin
    .from('procurement_alerts')
    .select('*')
    .eq('buyer_id', buyer_id)
    .eq('is_resolved', false)
    .order('severity', { ascending: true })
    .limit(20);
    
  if (alerts) {
    for (const alert of alerts) {
      let riskType: ProcurementRisk['type'] = 'coverage_gap';
      
      if (alert.alert_type?.includes('reliability') || alert.alert_type?.includes('supplier')) {
        riskType = 'supplier_decline';
      } else if (alert.alert_type?.includes('volatility') || alert.alert_type?.includes('price')) {
        riskType = 'price_volatility';
      } else if (alert.alert_type?.includes('stale')) {
        riskType = 'stale_offer';
      } else if (alert.alert_type?.includes('margin')) {
        riskType = 'margin_compression';
      }
      
      risks.push({
        id: alert.id,
        type: riskType,
        severity: alert.severity as ProcurementRisk['severity'],
        title: alert.title || alert.alert_type,
        description: alert.description || '',
        affected_products: alert.affected_count || 1,
        affected_spend: Number(alert.affected_spend || 0),
        recommended_action: alert.recommended_action || 'Review and take action',
        entity_id: alert.entity_id,
        entity_name: alert.entity_name,
        created_at: alert.created_at,
      });
    }
  }
  
  // Get supplier deterioration forecasts
  const { data: forecasts } = await supabaseAdmin
    .from('supplier_forecasts')
    .select(`
      id, supplier_id, forecast_score, forecast_band, predicted_direction, reasoning,
      suppliers(name)
    `)
    .eq('forecast_type', 'reliability_deterioration')
    .in('forecast_band', ['high_risk', 'watch'])
    .order('forecast_score', { ascending: false })
    .limit(10);
    
  if (forecasts) {
    for (const f of forecasts) {
      const supplier = f.suppliers as unknown as { name: string } | null;
      
      risks.push({
        id: `forecast-${f.id}`,
        type: 'supplier_decline',
        severity: f.forecast_band === 'high_risk' ? 'high' : 'medium',
        title: `Supplier Reliability Declining: ${supplier?.name || 'Unknown'}`,
        description: f.reasoning || 'Forecasted reliability deterioration',
        affected_products: 0,
        affected_spend: 0,
        recommended_action: 'Review supplier relationship and prepare alternatives',
        entity_id: f.supplier_id,
        entity_name: supplier?.name,
        created_at: new Date().toISOString(),
      });
    }
  }
  
  const { data: volatility } = await supabaseAdmin
    .from('price_volatility_forecasts')
    .select(`id, product_id, volatility_band, reasoning`)
    .eq('volatility_band', 'high_volatility')
    .order('volatility_score', { ascending: false })
    .limit(10);

  const vIds = Array.from(
    new Set((volatility ?? []).map((v) => v.product_id as string).filter(Boolean))
  );
  const volNames = await catalogProductNameMap(vIds);

  if (volatility) {
    for (const v of volatility) {
      const pname = volNames.get(v.product_id as string);
      risks.push({
        id: `volatility-${v.id}`,
        type: 'price_volatility',
        severity: 'medium',
        title: `High Price Volatility: ${pname ?? 'Unknown Product'}`,
        description: v.reasoning || 'Significant price fluctuations detected',
        affected_products: 1,
        affected_spend: 0,
        recommended_action: 'Consider locking in pricing or diversifying suppliers',
        entity_id: v.product_id,
        entity_name: pname,
        created_at: new Date().toISOString(),
      });
    }
  }
  
  return risks.sort((a, b) => {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}

// ============================================================================
// SPEND ANALYTICS
// ============================================================================

export async function getSpendAnalytics(
  buyer_id: string,
  filters?: {
    facility?: string;
    department?: string;
    start_date?: string;
    end_date?: string;
  }
): Promise<SpendAnalytics> {
  const endDate = filters?.end_date ? new Date(filters.end_date) : new Date();
  const startDate = filters?.start_date 
    ? new Date(filters.start_date) 
    : new Date(endDate.getTime() - 365 * 24 * 60 * 60 * 1000);

  const liveToCatalogUuid = new Map<number, string>();
  try {
    const catalogos = getSupabaseCatalogos();
    const { data: links } = await catalogos
      .from('products')
      .select('id, live_product_id')
      .not('live_product_id', 'is', null)
      .limit(20000);
    for (const row of links ?? []) {
      if (row.live_product_id != null && row.id != null) {
        liveToCatalogUuid.set(Number(row.live_product_id), String(row.id));
      }
    }
  } catch {
    // spend rollups still work when canonical_product_id is populated on order_items
  }
    
  type GcOrderLine = {
    quantity: number;
    unit_price_minor: number;
    total_minor: number;
    product_snapshot: Record<string, unknown> | null;
  };
  type GcOrder = {
    id: string;
    total_minor: number;
    placed_at: string;
    created_at: string;
    metadata: Record<string, unknown> | null;
    order_lines: GcOrderLine[] | null;
  };

  const minorToUsd = (n: number) => Number(n || 0) / 100;

  const { data: rawOrders, error: ordErr } = await supabaseAdmin
    .schema('gc_commerce')
    .from('orders')
    .select(
      `
      id, total_minor, placed_at, created_at, metadata,
      order_lines(quantity, unit_price_minor, total_minor, product_snapshot)
    `,
    )
    .eq('placed_by_user_id', buyer_id)
    .gte('placed_at', startDate.toISOString())
    .lte('placed_at', endDate.toISOString());

  if (ordErr) {
    console.error('[getSpendAnalytics] gc_commerce.orders', ordErr.message);
    throw ordErr;
  }

  let orders = (rawOrders ?? []) as unknown as GcOrder[];

  if (filters?.facility) {
    orders = orders.filter((o) => {
      const f = (o.metadata && typeof o.metadata.facility === 'string' && o.metadata.facility) || 'Unknown';
      return f === filters.facility;
    });
  }
  if (filters?.department) {
    orders = orders.filter((o) => {
      const d =
        (o.metadata && typeof o.metadata.department === 'string' && o.metadata.department) || 'Unknown';
      return d === filters.department;
    });
  }

  if (orders.length === 0) {
    return {
      total_spend: 0,
      period_spend: 0,
      by_facility: [],
      by_product: [],
      by_supplier: [],
      trend: [],
      avg_order_value: 0,
      order_count: 0,
    };
  }

  const lineCatalogId = (line: GcOrderLine): string | null => {
    const snap = line.product_snapshot;
    if (!snap || typeof snap !== 'object') return null;
    const c = snap.catalog_product_id;
    if (typeof c === 'string' && c.trim()) return c.trim();
    const legacy = snap.legacy_product_id;
    const n = typeof legacy === 'number' ? legacy : Number(legacy);
    if (Number.isFinite(n)) return liveToCatalogUuid.get(n) ?? null;
    return null;
  };

  const catalogIdSet = new Set<string>();
  for (const order of orders) {
    for (const line of order.order_lines ?? []) {
      const cid = lineCatalogId(line);
      if (cid) catalogIdSet.add(cid);
    }
  }
  const catalogIds = Array.from(catalogIdSet);
  const { data: cpRows } =
    catalogIds.length > 0
      ? await supabaseAdmin.schema('catalogos').from('products').select('id, name').in('id', catalogIds)
      : { data: [] as { id: string; name: string }[] };
  const catalogNameById = new Map((cpRows ?? []).map((r) => [r.id, r.name]));

  const totalSpend = orders.reduce((sum, o) => sum + minorToUsd(Number(o.total_minor || 0)), 0);

  const facilitySpend = new Map<string, number>();
  for (const order of orders) {
    const facility =
      (order.metadata && typeof order.metadata.facility === 'string' && order.metadata.facility) || 'Unknown';
    facilitySpend.set(facility, (facilitySpend.get(facility) || 0) + minorToUsd(Number(order.total_minor || 0)));
  }

  const byFacility = Array.from(facilitySpend.entries())
    .map(([facility, spend]) => ({
      facility,
      spend,
      percentage: totalSpend > 0 ? (spend / totalSpend) * 100 : 0,
    }))
    .sort((a, b) => b.spend - a.spend);

  const productSpend = new Map<string, { name: string; spend: number }>();
  for (const order of orders) {
    for (const line of order.order_lines ?? []) {
      const catalogId = lineCatalogId(line);
      const rollupKey = catalogId ?? 'unknown';
      const productName = (catalogId && catalogNameById.get(catalogId)) || 'Unknown';
      const itemSpend = Number(line.quantity) * minorToUsd(Number(line.unit_price_minor || 0));
      const existing = productSpend.get(rollupKey) || { name: productName, spend: 0 };
      existing.spend += itemSpend;
      productSpend.set(rollupKey, existing);
    }
  }

  const byProduct = Array.from(productSpend.entries())
    .map(([product_id, data]) => ({
      product_id,
      product_name: data.name,
      spend: data.spend,
      percentage: totalSpend > 0 ? (data.spend / totalSpend) * 100 : 0,
    }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 20);

  // gc_commerce.order_lines do not expose supplier_id in the snapshot used here.
  const bySupplier: Array<{
    supplier_id: string;
    supplier_name: string;
    spend: number;
    percentage: number;
  }> = [];

  const monthlySpend = new Map<string, number>();
  for (const order of orders) {
    const ts = order.placed_at || order.created_at;
    const month = new Date(ts).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
    monthlySpend.set(month, (monthlySpend.get(month) || 0) + minorToUsd(Number(order.total_minor || 0)));
  }

  const trend = Array.from(monthlySpend.entries())
    .map(([period, spend]) => ({ period, spend }))
    .sort((a, b) => new Date(a.period).getTime() - new Date(b.period).getTime());

  return {
    total_spend: totalSpend,
    period_spend: totalSpend,
    by_facility: byFacility,
    by_product: byProduct,
    by_supplier: bySupplier,
    trend,
    avg_order_value: totalSpend / orders.length,
    order_count: orders.length,
  };
}

// ============================================================================
// OPPORTUNITY ENGINE
// ============================================================================

export async function getSavingsOpportunities(
  buyer_id: string,
  limit: number = 20
): Promise<SavingsOpportunity[]> {
  const opportunities: SavingsOpportunity[] = [];
  
  const { data: marginOpps } = await supabaseAdmin
    .from('margin_opportunities')
    .select(`
      id, product_id, current_supplier_id, recommended_supplier_id,
      current_price, recommended_price, estimated_savings, savings_percentage,
      opportunity_score, reasoning,
      current_supplier:suppliers!margin_opportunities_current_supplier_id_fkey(name),
      recommended_supplier:suppliers!margin_opportunities_recommended_supplier_id_fkey(name)
    `)
    .eq('buyer_id', buyer_id)
    .eq('status', 'pending')
    .order('estimated_savings', { ascending: false })
    .limit(limit);

  const marginProductIds = (marginOpps ?? []).map((o) => o.product_id as string).filter(Boolean);
  const marginNames = await catalogProductNameMap(marginProductIds);

  if (marginOpps) {
    for (const opp of marginOpps) {
      const currentSupplier = opp.current_supplier as unknown as { name: string } | null;
      const recommendedSupplier = opp.recommended_supplier as unknown as { name: string } | null;

      opportunities.push({
        id: opp.id,
        type: 'supplier_switch',
        priority: Number(opp.opportunity_score) >= 0.8 ? 'high' : Number(opp.opportunity_score) >= 0.5 ? 'medium' : 'low',
        product_id: opp.product_id,
        product_name: marginNames.get(opp.product_id as string) || 'Unknown',
        current_supplier: currentSupplier?.name || 'Unknown',
        current_price: Number(opp.current_price),
        recommended_supplier: recommendedSupplier?.name,
        recommended_price: Number(opp.recommended_price),
        estimated_savings: Number(opp.estimated_savings),
        savings_percentage: Number(opp.savings_percentage),
        confidence: Number(opp.opportunity_score),
        reasoning: opp.reasoning || [],
        risk_factors: [],
      });
    }
  }
  
  const { data: rebidRecs } = await supabaseAdmin
    .from('commercial_guidance_recommendations')
    .select(`
      id, entity_id, guidance_type, guidance_score, title, summary, reasoning, recommended_action
    `)
    .eq('entity_type', 'product')
    .in('guidance_type', ['rebid_now', 'rebid_soon'])
    .eq('status', 'pending')
    .order('priority_score', { ascending: false })
    .limit(10);

  const rebidIds = (rebidRecs ?? []).map((r) => r.entity_id as string).filter(Boolean);
  const rebidNames = await catalogProductNameMap(rebidIds);

  if (rebidRecs) {
    for (const rec of rebidRecs) {
      opportunities.push({
        id: rec.id,
        type: 'rebid',
        priority: rec.guidance_type === 'rebid_now' ? 'high' : 'medium',
        product_id: rec.entity_id,
        product_name: rebidNames.get(rec.entity_id as string) || 'Unknown',
        current_supplier: 'Multiple',
        current_price: 0,
        estimated_savings: Number(rec.guidance_score) * 1000, // Estimate
        savings_percentage: Number(rec.guidance_score) * 20,
        confidence: Number(rec.guidance_score),
        reasoning: rec.reasoning ? [rec.reasoning] : [rec.summary],
        risk_factors: [],
      });
    }
  }
  
  return opportunities.sort((a, b) => b.estimated_savings - a.estimated_savings).slice(0, limit);
}

// ============================================================================
// SUPPLIER RISK FORECASTS
// ============================================================================

export async function getSupplierRiskForecasts(
  buyer_id: string
): Promise<SupplierRiskForecast[]> {
  // Previously derived supplier_ids from legacy public.orders/order_items. gc_commerce order_lines do not
  // expose supplier_id in product_snapshot; reintroduce forecasts when a canonical supplier graph exists.
  void buyer_id;
  return [];
}

// ============================================================================
// AI EXPLANATIONS
// ============================================================================

export async function getAIExplanation(
  product_id: string
): Promise<AIExplanation | null> {
  // Get product info
  const { data: product } = await getSupabaseCatalogos()
    .from('products')
    .select('id, name')
    .eq('id', product_id)
    .eq('is_active', true)
    .single();
    
  if (!product) return null;
  
  // Get recommendation
  const { data: recommendation } = await supabaseAdmin
    .from('supplier_recommendations')
    .select(`
      supplier_id, recommended_rank, recommendation_score, recommendation_band,
      recommendation_reasoning, trust_factor, price_factor, reliability_factor,
      suppliers(name)
    `)
    .eq('product_id', product_id)
    .order('calculated_at', { ascending: false })
    .limit(5);
    
  if (!recommendation || recommendation.length === 0) return null;
  
  const topRec = recommendation[0];
  const supplier = topRec.suppliers as unknown as { name: string } | null;
  
  // Get trust details
  const { data: trustScore } = await supabaseAdmin
    .from('offer_trust_scores')
    .select('trust_score, trust_band, trust_factors')
    .eq('supplier_id', topRec.supplier_id)
    .eq('product_id', product_id)
    .order('calculated_at', { ascending: false })
    .limit(1)
    .single();
    
  // Get pricing analysis
  const { data: pricingAnalysis } = await supabaseAdmin
    .from('ai_pricing_analysis')
    .select('reasoning, is_suspicious, anomaly_indicators')
    .eq('supplier_id', topRec.supplier_id)
    .eq('canonical_product_id', product_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
    
  // Build trust reasoning
  const trustReasoning: string[] = [];
  if (trustScore) {
    trustReasoning.push(`Trust score: ${(Number(trustScore.trust_score) * 100).toFixed(0)}% (${trustScore.trust_band})`);
    
    const factors = trustScore.trust_factors as Record<string, number> | null;
    if (factors) {
      if (factors.freshness >= 0.8) trustReasoning.push('Pricing is current and up-to-date');
      if (factors.supplier_reliability >= 0.8) trustReasoning.push('Supplier has strong reliability history');
      if (factors.pricing_confidence >= 0.8) trustReasoning.push('Pricing is consistent with market');
    }
  }
  
  // Build price reasoning
  const priceReasoning: string[] = [];
  priceReasoning.push(`Price factor: ${(Number(topRec.price_factor) * 100).toFixed(0)}%`);
  
  if (pricingAnalysis) {
    if (!pricingAnalysis.is_suspicious) {
      priceReasoning.push('No pricing anomalies detected');
    }
    if (pricingAnalysis.reasoning) {
      priceReasoning.push(pricingAnalysis.reasoning);
    }
  }
  
  // Build risk indicators
  const riskIndicators: string[] = [];
  if (pricingAnalysis?.is_suspicious) {
    riskIndicators.push('Pricing anomaly flagged for review');
    const indicators = pricingAnalysis.anomaly_indicators as string[] | null;
    if (indicators) {
      riskIndicators.push(...indicators.slice(0, 3));
    }
  }
  
  // Build alternatives
  const alternatives = recommendation.slice(1, 4).map(r => {
    const altSupplier = r.suppliers as unknown as { name: string } | null;
    const tradeOffs: string[] = [];
    
    if (Number(r.recommendation_score) < Number(topRec.recommendation_score)) {
      tradeOffs.push('Lower overall score');
    }
    if (Number(r.trust_factor) < Number(topRec.trust_factor)) {
      tradeOffs.push('Lower trust score');
    }
    if (Number(r.price_factor) < Number(topRec.price_factor)) {
      tradeOffs.push('Higher price');
    }
    
    return {
      supplier: altSupplier?.name || 'Unknown',
      price: 0, // Would need to fetch
      trade_offs: tradeOffs.length > 0 ? tradeOffs : ['Similar overall value'],
    };
  });
  
  return {
    recommendation_id: `${product_id}-${topRec.supplier_id}`,
    product_id,
    product_name: product.name,
    recommended_supplier: supplier?.name || 'Unknown',
    recommendation_type: topRec.recommendation_band,
    trust_reasoning: trustReasoning,
    price_reasoning: priceReasoning,
    risk_indicators: riskIndicators,
    confidence_factors: topRec.recommendation_reasoning || [],
    alternative_options: alternatives,
  };
}

// ============================================================================
// DASHBOARD SUMMARY
// ============================================================================

export async function getBuyerDashboardSummary(buyer_id: string): Promise<{
  savings: { realized: number; pipeline: number; ytd: number };
  risks: { critical: number; high: number; total: number };
  opportunities: { count: number; total_savings: number };
  spend: { total: number; avg_order: number };
}> {
  // Quick aggregations for dashboard header
  const [savings, risks, opportunities, spend] = await Promise.all([
    getSavingsSummary(buyer_id),
    getProcurementRisks(buyer_id),
    getSavingsOpportunities(buyer_id, 100),
    getSpendAnalytics(buyer_id),
  ]);
  
  return {
    savings: {
      realized: savings.realized,
      pipeline: savings.pipeline,
      ytd: savings.ytd.total,
    },
    risks: {
      critical: risks.filter(r => r.severity === 'critical').length,
      high: risks.filter(r => r.severity === 'high').length,
      total: risks.length,
    },
    opportunities: {
      count: opportunities.length,
      total_savings: opportunities.reduce((sum, o) => sum + o.estimated_savings, 0),
    },
    spend: {
      total: spend.total_spend,
      avg_order: spend.avg_order_value,
    },
  };
}
