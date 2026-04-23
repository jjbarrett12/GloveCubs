/**
 * Proactive Procurement Alerts
 * 
 * Generates alerts for:
 * - major margin opportunities
 * - supplier reliability deterioration
 * - stale critical offers
 * - repeated pricing anomalies
 * - sudden confidence drops
 * - suppliers generating disproportionate review load
 * - newly discovered better trusted offers
 */

import { supabaseAdmin } from '../jobs/supabase';
import { getTopMarginOpportunities, type MarginOpportunity } from './marginOpportunity';
import { getRiskySuppliers, type SupplierReliabilityScore } from './supplierReliability';
import { getLowTrustWinners, type OfferTrustScore } from './offerTrust';

// ============================================================================
// ALERT CONFIGURATION
// ============================================================================

// Cooldown period before re-alerting on same entity (hours)
const ALERT_COOLDOWN_HOURS = 72;  // 3 days cooldown for dismissed alerts

// Maximum alerts per type per run to prevent spam
const MAX_ALERTS_PER_TYPE = 5;

// Minimum opportunity savings to generate alert
const MIN_SAVINGS_PERCENT_FOR_ALERT = 12;

// Stale offer threshold for high severity (days)
const STALE_HIGH_SEVERITY_DAYS = 90;  // Increased from 60

// ============================================================================
// TYPES
// ============================================================================

export type AlertType = 
  | 'margin_opportunity'
  | 'supplier_risk'
  | 'stale_offer'
  | 'pricing_instability'
  | 'trust_drop'
  | 'review_load_spike'
  | 'better_offer_detected';

export type AlertSeverity = 'critical' | 'high' | 'normal' | 'low';
export type AlertStatus = 'open' | 'acknowledged' | 'resolved' | 'dismissed';

export interface ProcurementAlert {
  id?: string;
  alert_type: AlertType;
  severity: AlertSeverity;
  entity_type: string;
  entity_id: string | null;
  title: string;
  summary: string;
  reasoning: string;
  recommended_action: string;
  priority_score: number;
  status: AlertStatus;
  metadata: Record<string, unknown>;
}

// ============================================================================
// ALERT GENERATION
// ============================================================================

export async function generateProcurementAlerts(): Promise<{
  generated: number;
  by_type: Record<AlertType, number>;
}> {
  const alerts: ProcurementAlert[] = [];
  const by_type: Record<AlertType, number> = {
    margin_opportunity: 0,
    supplier_risk: 0,
    stale_offer: 0,
    pricing_instability: 0,
    trust_drop: 0,
    review_load_spike: 0,
    better_offer_detected: 0,
  };
  
  // Generate alerts from each source
  const [
    marginAlerts,
    supplierRiskAlerts,
    staleOfferAlerts,
    pricingInstabilityAlerts,
    trustDropAlerts,
    reviewLoadAlerts,
    betterOfferAlerts,
  ] = await Promise.all([
    generateMarginOpportunityAlerts(),
    generateSupplierRiskAlerts(),
    generateStaleOfferAlerts(),
    generatePricingInstabilityAlerts(),
    generateTrustDropAlerts(),
    generateReviewLoadSpikeAlerts(),
    generateBetterOfferAlerts(),
  ]);
  
  alerts.push(...marginAlerts);
  alerts.push(...supplierRiskAlerts);
  alerts.push(...staleOfferAlerts);
  alerts.push(...pricingInstabilityAlerts);
  alerts.push(...trustDropAlerts);
  alerts.push(...reviewLoadAlerts);
  alerts.push(...betterOfferAlerts);
  
  // Deduplicate against existing open alerts
  const newAlerts = await deduplicateAlerts(alerts);
  
  // Persist new alerts
  for (const alert of newAlerts) {
    await persistAlert(alert);
    by_type[alert.alert_type]++;
  }
  
  return {
    generated: newAlerts.length,
    by_type,
  };
}

// ============================================================================
// ALERT GENERATORS BY TYPE
// ============================================================================

async function generateMarginOpportunityAlerts(): Promise<ProcurementAlert[]> {
  const opportunities = await getTopMarginOpportunities(20);
  const alerts: ProcurementAlert[] = [];
  
  for (const opp of opportunities) {
    // Higher threshold to reduce noise
    if (opp.opportunity_band === 'major' && 
        opp.estimated_savings_percent && 
        opp.estimated_savings_percent > MIN_SAVINGS_PERCENT_FOR_ALERT) {
      
      // Skip opportunities that require review but have low trust
      if (opp.requires_review && opp.factors?.best_offer_trust < 0.5) {
        console.log(`[Alerts] Skipping margin opp for ${opp.product_id}: requires review with low trust`);
        continue;
      }
      
      // Critical only for very high savings with trusted offers
      const severity: AlertSeverity = 
        opp.estimated_savings_percent > 25 && !opp.requires_review ? 'critical' : 
        opp.estimated_savings_percent > 18 ? 'high' : 'normal';
      
      alerts.push({
        alert_type: 'margin_opportunity',
        severity,
        entity_type: 'product',
        entity_id: opp.product_id,
        title: `Major savings opportunity: ${opp.estimated_savings_percent.toFixed(1)}%`,
        summary: `Product has potential ${opp.estimated_savings_percent.toFixed(1)}% savings (${opp.estimated_savings_per_case ? `$${opp.estimated_savings_per_case.toFixed(2)}/case` : 'TBD'})`,
        reasoning: opp.reasoning,
        recommended_action: opp.requires_review 
          ? 'Review best offer before switching' 
          : 'Consider switching to recommended supplier',
        priority_score: Math.min(1, opp.opportunity_score + 0.2),
        status: 'open',
        metadata: {
          opportunity_score: opp.opportunity_score,
          savings_percent: opp.estimated_savings_percent,
          requires_review: opp.requires_review,
          best_offer_trust: opp.factors?.best_offer_trust,
        },
      });
      
      // Limit alerts per type
      if (alerts.length >= MAX_ALERTS_PER_TYPE) break;
    }
  }
  
  return alerts;
}

async function generateSupplierRiskAlerts(): Promise<ProcurementAlert[]> {
  const riskySuppliers = await getRiskySuppliers();
  const alerts: ProcurementAlert[] = [];
  
  for (const supplier of riskySuppliers) {
    const severity: AlertSeverity = 
      supplier.reliability_band === 'risky' ? 'high' : 'normal';
      
    alerts.push({
      alert_type: 'supplier_risk',
      severity,
      entity_type: 'supplier',
      entity_id: supplier.supplier_id,
      title: `Supplier reliability concern: ${supplier.reliability_band}`,
      summary: `Supplier scored ${(supplier.reliability_score * 100).toFixed(0)}% reliability`,
      reasoning: `Low scores in: ${identifyLowFactors(supplier)}`,
      recommended_action: 'Review supplier performance and consider alternative sources',
      priority_score: 1 - supplier.reliability_score,
      status: 'open',
      metadata: {
        reliability_score: supplier.reliability_score,
        reliability_band: supplier.reliability_band,
        completeness: supplier.completeness_score,
        freshness: supplier.freshness_score,
        accuracy: supplier.accuracy_score,
      },
    });
  }
  
  return alerts;
}

async function generateStaleOfferAlerts(): Promise<ProcurementAlert[]> {
  const alerts: ProcurementAlert[] = [];
  
  // Find offers not updated in 45+ days that are still active (increased from 30)
  const fortyFiveDaysAgo = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
  
  const { data: staleOffers } = await supabaseAdmin
    .from('supplier_offers')
    .select('id, supplier_id, product_id, updated_at, is_best_price')
    .eq('is_active', true)
    .lt('updated_at', fortyFiveDaysAgo)
    .order('updated_at', { ascending: true })  // Oldest first
    .limit(30);
    
  if (staleOffers) {
    let alertCount = 0;
    
    for (const offer of staleOffers) {
      const o = offer as { id: string; supplier_id: string; product_id: string; updated_at: string; is_best_price?: boolean };
      const ageMs = Date.now() - new Date(o.updated_at).getTime();
      const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
      
      // Only high severity for truly stale (90+ days) or if it's the best price offer
      const severity: AlertSeverity = 
        ageDays > STALE_HIGH_SEVERITY_DAYS ? 'high' : 
        (o.is_best_price && ageDays > 60) ? 'high' : 
        'low';  // Demoted from 'normal' - most stale offers are low priority
      
      // Skip low-severity stale alerts if we already have enough
      if (severity === 'low' && alertCount >= 3) continue;
      
      alerts.push({
        alert_type: 'stale_offer',
        severity,
        entity_type: 'offer',
        entity_id: o.id,
        title: `Stale pricing data: ${ageDays} days old`,
        summary: `Offer has not been updated in ${ageDays} days${o.is_best_price ? ' (current best price)' : ''}`,
        reasoning: 'Pricing data may no longer reflect current market',
        recommended_action: 'Request updated pricing from supplier or deactivate offer',
        priority_score: Math.min(1, ageDays / 120),  // Scaled to 120 days
        status: 'open',
        metadata: {
          age_days: ageDays,
          supplier_id: o.supplier_id,
          product_id: o.product_id,
          is_best_price: o.is_best_price,
        },
      });
      
      alertCount++;
      if (alertCount >= MAX_ALERTS_PER_TYPE) break;
    }
  }
  
  return alerts;
}

async function generatePricingInstabilityAlerts(): Promise<ProcurementAlert[]> {
  const alerts: ProcurementAlert[] = [];
  
  // Find products with repeated pricing anomalies
  const { data: anomalyCounts } = await supabaseAdmin
    .from('ai_pricing_analysis')
    .select('canonical_product_id')
    .eq('is_suspicious', true)
    .gte('created_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString());
    
  if (anomalyCounts) {
    // Group by product
    const productAnomalies: Record<string, number> = {};
    for (const a of anomalyCounts) {
      const pa = a as { canonical_product_id: string };
      productAnomalies[pa.canonical_product_id] = (productAnomalies[pa.canonical_product_id] || 0) + 1;
    }
    
    for (const [productId, count] of Object.entries(productAnomalies)) {
      if (count >= 3) {
        alerts.push({
          alert_type: 'pricing_instability',
          severity: count >= 5 ? 'high' : 'normal',
          entity_type: 'product',
          entity_id: productId,
          title: `Pricing instability: ${count} anomalies in 14 days`,
          summary: `Product has ${count} pricing anomalies in the last 2 weeks`,
          reasoning: 'Repeated anomalies may indicate feed issues or market volatility',
          recommended_action: 'Investigate pricing sources and validate current offers',
          priority_score: Math.min(1, count / 10),
          status: 'open',
          metadata: {
            anomaly_count: count,
            period_days: 14,
          },
        });
      }
    }
  }
  
  return alerts;
}

async function generateTrustDropAlerts(): Promise<ProcurementAlert[]> {
  const lowTrustWinners = await getLowTrustWinners();
  const alerts: ProcurementAlert[] = [];
  
  for (const winner of lowTrustWinners) {
    alerts.push({
      alert_type: 'trust_drop',
      severity: winner.trust_band === 'low_trust' ? 'high' : 'normal',
      entity_type: 'offer',
      entity_id: winner.offer_id,
      title: `Low-trust offer in winning position`,
      summary: `Offer has ${winner.trust_band} status (${(winner.trust_score * 100).toFixed(0)}% trust)`,
      reasoning: `Low trust due to: anomaly penalty ${(winner.anomaly_penalty * 100).toFixed(0)}%, override penalty ${(winner.override_penalty * 100).toFixed(0)}%`,
      recommended_action: 'Review offer before accepting as best price',
      priority_score: 1 - winner.trust_score,
      status: 'open',
      metadata: {
        trust_score: winner.trust_score,
        trust_band: winner.trust_band,
        supplier_id: winner.supplier_id,
        product_id: winner.product_id,
      },
    });
  }
  
  return alerts;
}

async function generateReviewLoadSpikeAlerts(): Promise<ProcurementAlert[]> {
  const alerts: ProcurementAlert[] = [];
  
  // Find suppliers with disproportionate review items
  const { data: reviewCounts } = await supabaseAdmin
    .from('review_queue')
    .select('source_id, source_table')
    .eq('status', 'open')
    .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
    
  if (reviewCounts && reviewCounts.length > 10) {
    // Group by supplier (assuming source relates to supplier products)
    const supplierReviews: Record<string, number> = {};
    for (const r of reviewCounts) {
      const rc = r as { source_id: string; source_table: string };
      if (rc.source_table === 'supplier_products') {
        supplierReviews[rc.source_id] = (supplierReviews[rc.source_id] || 0) + 1;
      }
    }
    
    const avgReviews = Object.values(supplierReviews).reduce((a, b) => a + b, 0) / 
      Math.max(1, Object.keys(supplierReviews).length);
      
    for (const [supplierId, count] of Object.entries(supplierReviews)) {
      if (count > avgReviews * 2 && count >= 5) {
        alerts.push({
          alert_type: 'review_load_spike',
          severity: count > avgReviews * 3 ? 'high' : 'normal',
          entity_type: 'supplier',
          entity_id: supplierId,
          title: `Supplier generating excessive review load`,
          summary: `${count} open review items vs ${avgReviews.toFixed(1)} average`,
          reasoning: 'Supplier may have data quality issues requiring attention',
          recommended_action: 'Review supplier data quality and feed configuration',
          priority_score: Math.min(1, count / 20),
          status: 'open',
          metadata: {
            review_count: count,
            average: avgReviews,
            period_days: 7,
          },
        });
      }
    }
  }
  
  return alerts;
}

async function generateBetterOfferAlerts(): Promise<ProcurementAlert[]> {
  const alerts: ProcurementAlert[] = [];
  
  // This alert type is too spammy by default - only alert for significant new opportunities
  // Requirements:
  // 1. Strong recommendation
  // 2. Not already the active supplier
  // 3. Meaningful price difference
  
  // Find products where a better trusted offer exists and represents real savings
  const { data: recs } = await supabaseAdmin
    .from('supplier_recommendations')
    .select('product_id, supplier_id, recommendation_reasoning, price, recommendation_score, factors, calculated_at')
    .eq('recommended_rank', 1)
    .eq('review_required', false)
    .in('recommendation_band', ['strong_recommendation'])
    .gte('recommendation_score', 0.8)  // High confidence only
    .gte('calculated_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())  // Recent only
    .limit(10);
    
  if (recs) {
    let alertCount = 0;
    
    for (const rec of recs) {
      const r = rec as {
        product_id: string;
        supplier_id: string;
        recommendation_reasoning: string;
        price: number;
        recommendation_score: number;
        factors?: { price_score?: number };
      };
      
      // Only alert if this is a meaningfully better price (price_score > 0.7 means good savings)
      const priceScore = r.factors?.price_score ?? 0.5;
      if (priceScore < 0.7) continue;
      
      alerts.push({
        alert_type: 'better_offer_detected',
        severity: 'low',  // Demoted from 'normal' - this is informational
        entity_type: 'product',
        entity_id: r.product_id,
        title: `Better trusted offer available`,
        summary: `Strongly recommended supplier at $${r.price.toFixed(2)}`,
        reasoning: r.recommendation_reasoning,
        recommended_action: 'Consider switching to recommended supplier',
        priority_score: 0.5,
        status: 'open',
        metadata: {
          recommended_supplier_id: r.supplier_id,
          recommended_price: r.price,
          recommendation_score: r.recommendation_score,
        },
      });
      
      alertCount++;
      if (alertCount >= 3) break;  // Very limited - these are low value
    }
  }
  
  return alerts;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function identifyLowFactors(supplier: SupplierReliabilityScore): string {
  const lowFactors: string[] = [];
  
  if (supplier.completeness_score < 0.6) lowFactors.push('completeness');
  if (supplier.freshness_score < 0.6) lowFactors.push('freshness');
  if (supplier.accuracy_score < 0.6) lowFactors.push('accuracy');
  if (supplier.stability_score < 0.6) lowFactors.push('stability');
  if (supplier.anomaly_penalty > 0.2) lowFactors.push('anomalies');
  if (supplier.override_penalty > 0.2) lowFactors.push('overrides');
  
  return lowFactors.length > 0 ? lowFactors.join(', ') : 'overall score';
}

async function deduplicateAlerts(alerts: ProcurementAlert[]): Promise<ProcurementAlert[]> {
  // Get existing open AND recently resolved/dismissed alerts
  const cooldownCutoff = new Date(Date.now() - ALERT_COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
  
  const { data: existingAlerts } = await supabaseAdmin
    .from('procurement_alerts')
    .select('alert_type, entity_type, entity_id, status, resolved_at, created_at')
    .or(`status.eq.open,status.eq.acknowledged,and(status.in.(resolved,dismissed),resolved_at.gte.${cooldownCutoff})`);
    
  if (!existingAlerts) return alerts;
  
  const existingKeys = new Set<string>();
  
  for (const a of existingAlerts) {
    const key = `${a.alert_type}:${a.entity_type}:${a.entity_id}`;
    
    // Open/acknowledged alerts always block duplicates
    if (a.status === 'open' || a.status === 'acknowledged') {
      existingKeys.add(key);
      continue;
    }
    
    // Resolved/dismissed within cooldown period also block
    if (a.resolved_at && new Date(a.resolved_at) > new Date(cooldownCutoff)) {
      existingKeys.add(key);
    }
  }
  
  return alerts.filter(a => {
    const key = `${a.alert_type}:${a.entity_type}:${a.entity_id}`;
    return !existingKeys.has(key);
  });
}

// ============================================================================
// PERSISTENCE
// ============================================================================

async function persistAlert(alert: ProcurementAlert): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('procurement_alerts')
    .insert({
      alert_type: alert.alert_type,
      severity: alert.severity,
      entity_type: alert.entity_type,
      entity_id: alert.entity_id,
      title: alert.title,
      summary: alert.summary,
      reasoning: alert.reasoning,
      recommended_action: alert.recommended_action,
      priority_score: alert.priority_score,
      status: alert.status,
      metadata: alert.metadata,
    })
    .select('id')
    .single();
    
  if (error) {
    console.error('Failed to persist alert:', error);
    return null;
  }
  
  return data?.id;
}

// ============================================================================
// ALERT MANAGEMENT
// ============================================================================

export async function resolveProcurementAlert(
  alert_id: string,
  resolution_notes: string,
  resolved_by?: string
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('procurement_alerts')
    .update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      resolved_by,
      resolution_notes,
    })
    .eq('id', alert_id);
    
  return !error;
}

export async function acknowledgeProcurementAlert(
  alert_id: string,
  acknowledged_by?: string
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('procurement_alerts')
    .update({
      status: 'acknowledged',
      acknowledged_at: new Date().toISOString(),
      acknowledged_by,
    })
    .eq('id', alert_id);
    
  return !error;
}

export async function dismissProcurementAlert(
  alert_id: string,
  reason: string
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('procurement_alerts')
    .update({
      status: 'dismissed',
      resolved_at: new Date().toISOString(),
      resolution_notes: `Dismissed: ${reason}`,
    })
    .eq('id', alert_id);
    
  return !error;
}

// ============================================================================
// RETRIEVAL
// ============================================================================

export async function getActiveAlerts(limit: number = 50): Promise<ProcurementAlert[]> {
  const { data } = await supabaseAdmin
    .from('active_procurement_alerts')
    .select('*')
    .limit(limit);
    
  if (!data) return [];
  
  return data.map(d => ({
    id: d.id,
    alert_type: d.alert_type as AlertType,
    severity: d.severity as AlertSeverity,
    entity_type: d.entity_type,
    entity_id: d.entity_id,
    title: d.title,
    summary: d.summary,
    reasoning: d.reasoning,
    recommended_action: d.recommended_action,
    priority_score: Number(d.priority_score),
    status: d.status as AlertStatus,
    metadata: d.metadata || {},
  }));
}

export async function getAlertsBySeverity(severity: AlertSeverity): Promise<ProcurementAlert[]> {
  const { data } = await supabaseAdmin
    .from('procurement_alerts')
    .select('*')
    .eq('severity', severity)
    .eq('status', 'open')
    .order('priority_score', { ascending: false })
    .limit(20);
    
  if (!data) return [];
  
  return data.map(d => ({
    id: d.id,
    alert_type: d.alert_type as AlertType,
    severity: d.severity as AlertSeverity,
    entity_type: d.entity_type,
    entity_id: d.entity_id,
    title: d.title,
    summary: d.summary,
    reasoning: d.reasoning,
    recommended_action: d.recommended_action,
    priority_score: Number(d.priority_score),
    status: d.status as AlertStatus,
    metadata: d.metadata || {},
  }));
}

export async function getAlertStats(): Promise<{
  total_open: number;
  by_severity: Record<AlertSeverity, number>;
  by_type: Record<AlertType, number>;
}> {
  const { data } = await supabaseAdmin
    .from('procurement_alerts')
    .select('severity, alert_type')
    .eq('status', 'open');
    
  const by_severity: Record<AlertSeverity, number> = {
    critical: 0,
    high: 0,
    normal: 0,
    low: 0,
  };
  
  const by_type: Record<AlertType, number> = {
    margin_opportunity: 0,
    supplier_risk: 0,
    stale_offer: 0,
    pricing_instability: 0,
    trust_drop: 0,
    review_load_spike: 0,
    better_offer_detected: 0,
  };
  
  if (data) {
    for (const d of data) {
      by_severity[d.severity as AlertSeverity]++;
      by_type[d.alert_type as AlertType]++;
    }
  }
  
  return {
    total_open: data?.length || 0,
    by_severity,
    by_type,
  };
}
