/**
 * Commercial Guidance Engine
 * 
 * Generates forward-looking recommendations for rebidding and re-sourcing.
 * 
 * SAFETY RULES:
 * - Recommendations must be conservative and auditable
 * - Do not spam operators with repetitive low-value recommendations
 * - Deduplicate overlapping guidance items
 * - Suppress weak-signal recommendations
 * - Label all outputs as predictive guidance, not facts
 */

import { supabaseAdmin } from '../jobs/supabase';
import { getSuppliersLikelyToDeteriorate } from './supplierForecasting';
import { getProductsWithRisingVolatility } from './priceVolatility';

// ============================================================================
// TYPES
// ============================================================================

export type GuidanceType = 
  | 'rebid_now'
  | 'rebid_soon'
  | 're_source_supplier'
  | 'monitor_closely'
  | 'no_action';

export type GuidanceBand = 'urgent' | 'high' | 'moderate' | 'low';
export type GuidanceStatus = 'open' | 'acknowledged' | 'actioned' | 'dismissed' | 'expired';

export interface CommercialGuidance {
  id?: string;
  guidance_type: GuidanceType;
  entity_type: string;
  entity_id: string;
  guidance_score: number;
  guidance_band: GuidanceBand;
  title: string;
  summary: string;
  reasoning: string;
  recommended_action: string;
  evidence: GuidanceEvidence;
  window_days: number;
  priority_score: number;
  confidence: number;
  status: GuidanceStatus;
}

export interface GuidanceEvidence {
  trigger_type: string;
  forecast_score?: number;
  forecast_band?: string;
  rejection_count?: number;
  /** Sample size for rejection_rate (recommendations considered). */
  total_recommendations?: number;
  rejection_rate?: number;
  stale_days?: number;
  offer_count?: number;
  recent_activity_count?: number;
  alert_count?: number;
  trust_score?: number;
  reliability_score?: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const GUIDANCE_CONFIG = {
  min_confidence_threshold: 0.55,   // Increased from 0.5
  min_sample_for_guidance: 10,      // Minimum samples before generating guidance
  
  // Rebid triggers - made less aggressive
  rebid_now_volatility_threshold: 0.75,  // Increased from 0.7
  rebid_soon_volatility_threshold: 0.5,  // Increased from 0.4
  rejection_rate_threshold: 0.45,        // Increased from 0.4
  stale_days_threshold: 45,              // Increased from 30 - more tolerance
  very_stale_days_threshold: 60,         // New threshold for high-band
  
  // Suppression
  max_active_per_entity: 2,
  max_active_total_db_check: 3,     // Check existing DB guidance count
  min_change_for_update: 0.15,      // Increased from 0.1 to reduce noise
  
  // Confidence scaling
  min_recommendations_for_full_confidence: 25,  // Increased from 20
};

// ============================================================================
// MAIN GUIDANCE GENERATION
// ============================================================================

export async function generateCommercialGuidanceRecommendations(): Promise<{
  generated: number;
  suppressed: number;
  by_type: Record<GuidanceType, number>;
}> {
  const by_type: Record<GuidanceType, number> = {
    rebid_now: 0,
    rebid_soon: 0,
    're_source_supplier': 0,
    monitor_closely: 0,
    no_action: 0,
  };
  
  let generated = 0;
  let suppressed = 0;
  
  // Generate guidance from multiple triggers
  const [
    supplierDeteriorationGuidance,
    priceVolatilityGuidance,
    rejectionPatternGuidance,
    staleOfferGuidance,
    alertPatternGuidance,
  ] = await Promise.all([
    generateSupplierDeteriorationGuidance(),
    generatePriceVolatilityGuidance(),
    generateRejectionPatternGuidance(),
    generateStaleOfferGuidance(),
    generateAlertPatternGuidance(),
  ]);
  
  const allGuidance = [
    ...supplierDeteriorationGuidance,
    ...priceVolatilityGuidance,
    ...rejectionPatternGuidance,
    ...staleOfferGuidance,
    ...alertPatternGuidance,
  ];
  
  // Deduplicate and filter
  const filtered = await deduplicateAndFilter(allGuidance);
  
  // Persist
  for (const guidance of filtered) {
    const persisted = await persistGuidance(guidance);
    if (persisted) {
      generated++;
      by_type[guidance.guidance_type]++;
    } else {
      suppressed++;
    }
  }
  
  suppressed += allGuidance.length - filtered.length;
  
  return { generated, suppressed, by_type };
}

// ============================================================================
// GUIDANCE GENERATORS
// ============================================================================

async function generateSupplierDeteriorationGuidance(): Promise<CommercialGuidance[]> {
  const guidance: CommercialGuidance[] = [];
  
  const deterioratingSuppliers = await getSuppliersLikelyToDeteriorate(30);
  
  for (const forecast of deterioratingSuppliers) {
    if (forecast.confidence < GUIDANCE_CONFIG.min_confidence_threshold) continue;
    
    let guidance_type: GuidanceType = 'monitor_closely';
    let guidance_band: GuidanceBand = 'low';
    
    if (forecast.forecast_band === 'high_risk') {
      guidance_type = 're_source_supplier';
      guidance_band = 'high';
    } else if (forecast.forecast_band === 'watch') {
      guidance_type = 'monitor_closely';
      guidance_band = 'moderate';
    }
    
    if (guidance_type === 'monitor_closely' && forecast.confidence < 0.6) {
      continue; // Suppress weak monitor signals
    }
    
    guidance.push({
      guidance_type,
      entity_type: 'supplier',
      entity_id: forecast.supplier_id,
      guidance_score: forecast.forecast_score,
      guidance_band,
      title: `Supplier showing ${forecast.forecast_band} deterioration signals`,
      summary: `${forecast.forecast_type}: ${forecast.predicted_impact}`,
      reasoning: forecast.reasoning,
      recommended_action: guidance_type === 're_source_supplier'
        ? 'Consider alternative suppliers for products from this source'
        : 'Monitor supplier metrics closely for continued decline',
      evidence: {
        trigger_type: 'supplier_deterioration',
        forecast_score: forecast.forecast_score,
        forecast_band: forecast.forecast_band,
        reliability_score: forecast.evidence.recent_score,
      },
      window_days: 30,
      priority_score: forecast.forecast_score,
      confidence: forecast.confidence,
      status: 'open',
    });
  }
  
  return guidance;
}

async function generatePriceVolatilityGuidance(): Promise<CommercialGuidance[]> {
  const guidance: CommercialGuidance[] = [];
  
  const volatileProducts = await getProductsWithRisingVolatility(50);
  
  for (const forecast of volatileProducts) {
    if (forecast.confidence < GUIDANCE_CONFIG.min_confidence_threshold) continue;
    
    let guidance_type: GuidanceType = 'monitor_closely';
    let guidance_band: GuidanceBand = 'low';
    
    if (forecast.volatility_score >= GUIDANCE_CONFIG.rebid_now_volatility_threshold) {
      guidance_type = 'rebid_now';
      guidance_band = 'urgent';
    } else if (forecast.volatility_score >= GUIDANCE_CONFIG.rebid_soon_volatility_threshold) {
      guidance_type = 'rebid_soon';
      guidance_band = 'high';
    }
    
    if (guidance_type === 'monitor_closely') continue; // Don't create weak volatility guidance
    
    guidance.push({
      guidance_type,
      entity_type: 'product',
      entity_id: forecast.product_id,
      guidance_score: forecast.volatility_score,
      guidance_band,
      title: `Product showing ${forecast.volatility_band} price volatility`,
      summary: forecast.predicted_risk,
      reasoning: forecast.reasoning,
      recommended_action: guidance_type === 'rebid_now'
        ? 'Immediate rebid recommended - pricing unstable'
        : 'Schedule rebid - volatility trending upward',
      evidence: {
        trigger_type: 'price_volatility',
        forecast_score: forecast.volatility_score,
        forecast_band: forecast.volatility_band,
      },
      window_days: 30,
      priority_score: forecast.volatility_score,
      confidence: forecast.confidence,
      status: 'open',
    });
  }
  
  return guidance;
}

async function generateRejectionPatternGuidance(): Promise<CommercialGuidance[]> {
  const guidance: CommercialGuidance[] = [];
  
  // Find suppliers with high rejection rates
  const { data: rejectionData } = await supabaseAdmin
    .from('most_overridden_suppliers')
    .select('*')
    .gt('rejection_rate_percent', GUIDANCE_CONFIG.rejection_rate_threshold * 100)
    .limit(20);
    
  if (!rejectionData) return [];
  
  for (const supplier of rejectionData) {
    const rejectionRate = Number(supplier.rejection_rate_percent) / 100;
    const totalRecs = Number(supplier.total_recommendations);
    
    // Require minimum sample size before generating guidance
    if (totalRecs < GUIDANCE_CONFIG.min_sample_for_guidance) {
      continue;
    }
    
    // Calculate confidence with higher threshold
    const confidence = Math.min(1, totalRecs / GUIDANCE_CONFIG.min_recommendations_for_full_confidence);
    
    // Skip low-confidence guidance
    if (confidence < GUIDANCE_CONFIG.min_confidence_threshold) {
      continue;
    }
    
    // Generate detailed reasoning based on the data
    let reasoningParts: string[] = [];
    reasoningParts.push(`${(rejectionRate * 100).toFixed(0)}% rejection rate (${supplier.rejection_count}/${totalRecs})`);
    
    if (rejectionRate > 0.6) {
      reasoningParts.push('consistently poor recommendation fit');
    } else if (rejectionRate > 0.5) {
      reasoningParts.push('frequent operator overrides suggest mismatch');
    } else {
      reasoningParts.push('elevated rejection rate warrants review');
    }
    
    // Determine band and action based on rejection severity AND sample size
    let guidance_band: GuidanceBand;
    let recommended_action: string;
    
    if (rejectionRate > 0.6 && totalRecs >= 15) {
      guidance_band = 'high';
      recommended_action = 'Strong pattern: Evaluate alternative suppliers for products this supplier provides';
    } else if (rejectionRate > 0.5 || (rejectionRate > 0.45 && totalRecs >= 20)) {
      guidance_band = 'moderate';
      recommended_action = 'Review why recommendations are rejected - may need criteria adjustment or supplier discussion';
    } else {
      guidance_band = 'low';
      recommended_action = 'Monitor pattern - may resolve with time or small adjustments';
    }
    
    guidance.push({
      guidance_type: 're_source_supplier',
      entity_type: 'supplier',
      entity_id: supplier.supplier_id,
      guidance_score: rejectionRate,
      guidance_band,
      title: `Supplier recommendations frequently rejected`,
      summary: `${supplier.rejection_count} of ${totalRecs} recommendations rejected (${(rejectionRate * 100).toFixed(0)}%)`,
      reasoning: reasoningParts.join(' - '),
      recommended_action,
      evidence: {
        trigger_type: 'rejection_pattern',
        rejection_count: supplier.rejection_count,
        total_recommendations: totalRecs,
        rejection_rate: rejectionRate,
      },
      window_days: 30,
      priority_score: rejectionRate * (1 + Math.log10(totalRecs) / 3), // Boost priority with more data
      confidence,
      status: 'open',
    });
  }
  
  return guidance;
}

async function generateStaleOfferGuidance(): Promise<CommercialGuidance[]> {
  const guidance: CommercialGuidance[] = [];
  
  // Find products with stale best offers
  const staleDaysAgo = new Date(Date.now() - GUIDANCE_CONFIG.stale_days_threshold * 24 * 60 * 60 * 1000);
  
  const { data: staleOffers } = await supabaseAdmin
    .from('supplier_offers')
    .select('id, product_id, supplier_id, updated_at')
    .eq('is_active', true)
    .lt('updated_at', staleDaysAgo.toISOString())
    .limit(50);
    
  if (!staleOffers) return [];
  
  // Group by product with offer count
  const productStale: Record<string, { maxAge: number; offerCount: number }> = {};
  
  for (const offer of staleOffers) {
    const o = offer as { product_id: string; updated_at: string };
    const ageDays = Math.floor((Date.now() - new Date(o.updated_at).getTime()) / (24 * 60 * 60 * 1000));
    if (!productStale[o.product_id]) {
      productStale[o.product_id] = { maxAge: 0, offerCount: 0 };
    }
    productStale[o.product_id].maxAge = Math.max(productStale[o.product_id].maxAge, ageDays);
    productStale[o.product_id].offerCount++;
  }
  
  // Get recent activity for these products to adjust confidence
  const productIds = Object.keys(productStale);
  const { data: recentOutcomes } = await supabaseAdmin
    .from('recommendation_outcomes')
    .select('product_id')
    .in('product_id', productIds)
    .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());
  
  const productActivity: Record<string, number> = {};
  for (const outcome of recentOutcomes || []) {
    productActivity[outcome.product_id] = (productActivity[outcome.product_id] || 0) + 1;
  }
  
  for (const [productId, data] of Object.entries(productStale)) {
    const staleDays = data.maxAge;
    if (staleDays < GUIDANCE_CONFIG.stale_days_threshold) continue;
    
    // Calculate confidence based on product activity - high-activity products
    // need fresher data, so staleness is more confident concern
    const activityLevel = productActivity[productId] || 0;
    let confidence: number;
    if (activityLevel >= 10) {
      confidence = 0.85; // High activity = stale data is definitely a problem
    } else if (activityLevel >= 3) {
      confidence = 0.7;
    } else {
      confidence = 0.5; // Low activity = maybe this product is just rarely used
    }
    
    // Determine band based on staleness AND activity
    let guidance_band: GuidanceBand = 'moderate';
    if (staleDays >= GUIDANCE_CONFIG.very_stale_days_threshold && activityLevel >= 5) {
      guidance_band = 'high';
    } else if (staleDays >= GUIDANCE_CONFIG.very_stale_days_threshold || activityLevel >= 10) {
      guidance_band = 'moderate';
    } else {
      guidance_band = 'low';
    }
    
    // Generate specific reasoning
    const activityNote = activityLevel > 0 
      ? ` (${activityLevel} recent recommendation outcomes)`
      : ' (no recent activity - may be low-priority)';
    
    guidance.push({
      guidance_type: 'rebid_soon',
      entity_type: 'product',
      entity_id: productId,
      guidance_score: Math.min(1, staleDays / 90),
      guidance_band,
      title: `Product pricing data is stale`,
      summary: `Best offer not updated in ${staleDays} days${activityNote}`,
      reasoning: `Stale pricing may not reflect current market conditions. ${data.offerCount} offer(s) affected.`,
      recommended_action: activityLevel > 5 
        ? 'High-priority: Request updated pricing from suppliers immediately'
        : 'Request updated pricing from suppliers when convenient',
      evidence: {
        trigger_type: 'stale_offer',
        stale_days: staleDays,
        offer_count: data.offerCount,
        recent_activity_count: activityLevel,
      },
      window_days: 30,
      priority_score: Math.min(1, (staleDays / 90) * (1 + activityLevel / 20)),
      confidence,
      status: 'open',
    });
  }
  
  return guidance;
}

async function generateAlertPatternGuidance(): Promise<CommercialGuidance[]> {
  const guidance: CommercialGuidance[] = [];
  
  // Find entities with repeated alerts
  const { data: alerts } = await supabaseAdmin
    .from('procurement_alerts')
    .select('entity_type, entity_id, alert_type')
    .eq('status', 'open')
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
    
  if (!alerts || alerts.length === 0) return [];
  
  // Count alerts per entity
  const entityAlerts: Record<string, { count: number; types: Set<string> }> = {};
  
  for (const alert of alerts) {
    const key = `${alert.entity_type}:${alert.entity_id}`;
    if (!entityAlerts[key]) {
      entityAlerts[key] = { count: 0, types: new Set() };
    }
    entityAlerts[key].count++;
    entityAlerts[key].types.add(alert.alert_type);
  }
  
  for (const [key, data] of Object.entries(entityAlerts)) {
    if (data.count < 3) continue; // Only flag repeated alert patterns
    
    const [entityType, entityId] = key.split(':');
    
    guidance.push({
      guidance_type: 'monitor_closely',
      entity_type: entityType,
      entity_id: entityId,
      guidance_score: Math.min(1, data.count / 10),
      guidance_band: data.count >= 5 ? 'high' : 'moderate',
      title: `Multiple active alerts for this ${entityType}`,
      summary: `${data.count} open alerts across ${data.types.size} categories`,
      reasoning: `Repeated alerts suggest systemic issues requiring attention`,
      recommended_action: 'Review and address underlying causes',
      evidence: {
        trigger_type: 'alert_pattern',
        alert_count: data.count,
      },
      window_days: 30,
      priority_score: Math.min(1, data.count / 10),
      confidence: 0.7,
      status: 'open',
    });
  }
  
  return guidance;
}

// ============================================================================
// DEDUPLICATION AND FILTERING
// ============================================================================

async function deduplicateAndFilter(
  guidance: CommercialGuidance[]
): Promise<CommercialGuidance[]> {
  // Sort by priority (highest first)
  guidance.sort((a, b) => b.priority_score - a.priority_score);
  
  // Get existing active guidance with count per entity
  const { data: existingGuidance } = await supabaseAdmin
    .from('commercial_guidance_recommendations')
    .select('entity_type, entity_id, guidance_type, guidance_score')
    .eq('status', 'open');
    
  const existingKeys = new Set<string>();
  const existingScores: Record<string, number> = {};
  const existingEntityCounts: Record<string, number> = {};
  
  if (existingGuidance) {
    for (const eg of existingGuidance) {
      const key = `${eg.entity_type}:${eg.entity_id}:${eg.guidance_type}`;
      const entityKey = `${eg.entity_type}:${eg.entity_id}`;
      existingKeys.add(key);
      existingScores[key] = Number(eg.guidance_score);
      existingEntityCounts[entityKey] = (existingEntityCounts[entityKey] || 0) + 1;
    }
  }
  
  const filtered: CommercialGuidance[] = [];
  const seenEntities: Record<string, number> = {};
  
  for (const g of guidance) {
    const key = `${g.entity_type}:${g.entity_id}:${g.guidance_type}`;
    const entityKey = `${g.entity_type}:${g.entity_id}`;
    
    // Skip if already exists with similar score
    if (existingKeys.has(key)) {
      const scoreDiff = Math.abs(g.guidance_score - (existingScores[key] || 0));
      if (scoreDiff < GUIDANCE_CONFIG.min_change_for_update) {
        continue;
      }
    }
    
    // Check TOTAL guidance per entity (new + existing in DB)
    const existingCount = existingEntityCounts[entityKey] || 0;
    seenEntities[entityKey] = (seenEntities[entityKey] || 0) + 1;
    const totalForEntity = existingCount + seenEntities[entityKey];
    
    // Skip if entity already has too much guidance (combining DB + new)
    if (totalForEntity > GUIDANCE_CONFIG.max_active_total_db_check) {
      continue;
    }
    
    // Also enforce per-run limit
    if (seenEntities[entityKey] > GUIDANCE_CONFIG.max_active_per_entity) {
      continue;
    }
    
    // Suppress low-confidence weak signals
    if (g.confidence < GUIDANCE_CONFIG.min_confidence_threshold && g.guidance_band === 'low') {
      continue;
    }
    
    // Also suppress moderate-band items with very low confidence
    if (g.confidence < 0.4 && g.guidance_band === 'moderate') {
      continue;
    }
    
    filtered.push(g);
  }
  
  return filtered;
}

// ============================================================================
// PERSISTENCE
// ============================================================================

async function persistGuidance(guidance: CommercialGuidance): Promise<boolean> {
  try {
    // Check for existing active guidance (unique constraint will also catch this)
    const { data: existing } = await supabaseAdmin
      .from('commercial_guidance_recommendations')
      .select('id')
      .eq('entity_type', guidance.entity_type)
      .eq('entity_id', guidance.entity_id)
      .eq('guidance_type', guidance.guidance_type)
      .eq('status', 'open')
      .single();
      
    if (existing) {
      // Update existing
      await supabaseAdmin
        .from('commercial_guidance_recommendations')
        .update({
          guidance_score: guidance.guidance_score,
          guidance_band: guidance.guidance_band,
          title: guidance.title,
          summary: guidance.summary,
          reasoning: guidance.reasoning,
          recommended_action: guidance.recommended_action,
          evidence: guidance.evidence,
          priority_score: guidance.priority_score,
          confidence: guidance.confidence,
        })
        .eq('id', existing.id);
      return true;
    }
    
    await supabaseAdmin
      .from('commercial_guidance_recommendations')
      .insert({
        guidance_type: guidance.guidance_type,
        entity_type: guidance.entity_type,
        entity_id: guidance.entity_id,
        guidance_score: guidance.guidance_score,
        guidance_band: guidance.guidance_band,
        title: guidance.title,
        summary: guidance.summary,
        reasoning: guidance.reasoning,
        recommended_action: guidance.recommended_action,
        evidence: guidance.evidence,
        window_days: guidance.window_days,
        priority_score: guidance.priority_score,
        confidence: guidance.confidence,
        status: 'open',
      });
      
    return true;
  } catch (error) {
    console.error('Failed to persist guidance:', error);
    return false;
  }
}

// ============================================================================
// GUIDANCE MANAGEMENT
// ============================================================================

export async function acknowledgeGuidance(
  guidance_id: string,
  acknowledged_by?: string
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('commercial_guidance_recommendations')
    .update({
      status: 'acknowledged',
      actioned_by: acknowledged_by,
    })
    .eq('id', guidance_id);
    
  return !error;
}

export async function actionGuidance(
  guidance_id: string,
  action_notes: string,
  actioned_by?: string
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('commercial_guidance_recommendations')
    .update({
      status: 'actioned',
      actioned_at: new Date().toISOString(),
      actioned_by,
      action_notes,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', guidance_id);
    
  return !error;
}

export async function dismissGuidance(
  guidance_id: string,
  reason: string
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('commercial_guidance_recommendations')
    .update({
      status: 'dismissed',
      action_notes: `Dismissed: ${reason}`,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', guidance_id);
    
  return !error;
}

// ============================================================================
// RETRIEVAL
// ============================================================================

export async function getUrgentGuidance(limit: number = 20): Promise<CommercialGuidance[]> {
  const { data } = await supabaseAdmin
    .from('urgent_commercial_guidance')
    .select('*')
    .limit(limit);
    
  if (!data) return [];
  
  return data.map(d => ({
    id: d.id,
    guidance_type: d.guidance_type as GuidanceType,
    entity_type: d.entity_type,
    entity_id: d.entity_id,
    guidance_score: Number(d.guidance_score),
    guidance_band: d.guidance_band as GuidanceBand,
    title: d.title,
    summary: d.summary,
    reasoning: d.reasoning,
    recommended_action: d.recommended_action,
    evidence: d.evidence as GuidanceEvidence,
    window_days: d.window_days,
    priority_score: Number(d.priority_score),
    confidence: Number(d.confidence),
    status: d.status as GuidanceStatus,
  }));
}

export async function getAllActiveGuidance(limit: number = 50): Promise<CommercialGuidance[]> {
  const { data } = await supabaseAdmin
    .from('commercial_guidance_recommendations')
    .select('*')
    .eq('status', 'open')
    .order('priority_score', { ascending: false })
    .limit(limit);
    
  if (!data) return [];
  
  return data.map(d => ({
    id: d.id,
    guidance_type: d.guidance_type as GuidanceType,
    entity_type: d.entity_type,
    entity_id: d.entity_id,
    guidance_score: Number(d.guidance_score),
    guidance_band: d.guidance_band as GuidanceBand,
    title: d.title,
    summary: d.summary,
    reasoning: d.reasoning,
    recommended_action: d.recommended_action,
    evidence: d.evidence as GuidanceEvidence,
    window_days: d.window_days,
    priority_score: Number(d.priority_score),
    confidence: Number(d.confidence),
    status: d.status as GuidanceStatus,
  }));
}

export async function getGuidanceStats(): Promise<{
  total_open: number;
  by_band: Record<GuidanceBand, number>;
  by_type: Record<GuidanceType, number>;
}> {
  const { data } = await supabaseAdmin
    .from('commercial_guidance_recommendations')
    .select('guidance_band, guidance_type')
    .eq('status', 'open');
    
  const by_band: Record<GuidanceBand, number> = {
    urgent: 0,
    high: 0,
    moderate: 0,
    low: 0,
  };
  
  const by_type: Record<GuidanceType, number> = {
    rebid_now: 0,
    rebid_soon: 0,
    're_source_supplier': 0,
    monitor_closely: 0,
    no_action: 0,
  };
  
  if (data) {
    for (const d of data) {
      by_band[d.guidance_band as GuidanceBand]++;
      by_type[d.guidance_type as GuidanceType]++;
    }
  }
  
  return {
    total_open: data?.length || 0,
    by_band,
    by_type,
  };
}
