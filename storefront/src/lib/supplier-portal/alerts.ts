/**
 * Supplier Portal Alerts
 * 
 * Manages alerts shown to suppliers in the portal.
 */

import { supabaseAdmin } from '../jobs/supabase';
import { logAuditEvent } from './auth';

// ============================================================================
// TYPES
// ============================================================================

export type AlertType = 
  | 'reliability_deterioration'
  | 'stale_offers'
  | 'price_volatility'
  | 'lost_recommendation_rank'
  | 'low_trust_offers'
  | 'feed_quality_issue'
  | 'anomaly_detected'
  | 'competitive_pressure';

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface SupplierAlert {
  id: string;
  supplier_id: string;
  alert_type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  details: Record<string, unknown>;
  is_read: boolean;
  is_dismissed: boolean;
  created_at: string;
  read_at: string | null;
  dismissed_at: string | null;
}

// ============================================================================
// LIST ALERTS
// ============================================================================

export async function listAlerts(
  supplier_id: string,
  options: {
    unread_only?: boolean;
    severity?: AlertSeverity;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ alerts: SupplierAlert[]; total: number }> {
  let query = supabaseAdmin
    .from('supplier_portal_alerts')
    .select('*', { count: 'exact' })
    .eq('supplier_id', supplier_id)
    .eq('is_dismissed', false);
    
  if (options.unread_only) {
    query = query.eq('is_read', false);
  }
  
  if (options.severity) {
    query = query.eq('severity', options.severity);
  }
  
  query = query
    .order('created_at', { ascending: false })
    .range(options.offset || 0, (options.offset || 0) + (options.limit || 50) - 1);
    
  const { data, count, error } = await query;
  
  if (error || !data) {
    return { alerts: [], total: 0 };
  }
  
  return {
    alerts: data.map(d => ({
      id: d.id,
      supplier_id: d.supplier_id,
      alert_type: d.alert_type as AlertType,
      severity: d.severity as AlertSeverity,
      title: d.title,
      message: d.message,
      details: d.details as Record<string, unknown>,
      is_read: d.is_read,
      is_dismissed: d.is_dismissed,
      created_at: d.created_at,
      read_at: d.read_at,
      dismissed_at: d.dismissed_at,
    })),
    total: count || 0,
  };
}

// ============================================================================
// MARK AS READ
// ============================================================================

export async function markAlertAsRead(
  supplier_id: string,
  user_id: string,
  alert_id: string
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('supplier_portal_alerts')
    .update({ 
      is_read: true, 
      read_at: new Date().toISOString(),
    })
    .eq('id', alert_id)
    .eq('supplier_id', supplier_id);
    
  if (!error) {
    await logAuditEvent(supplier_id, user_id, 'read_alert', 'supplier_portal_alert', alert_id, {});
  }
  
  return !error;
}

export async function markAllAlertsAsRead(
  supplier_id: string,
  user_id: string
): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('supplier_portal_alerts')
    .update({ 
      is_read: true, 
      read_at: new Date().toISOString(),
    })
    .eq('supplier_id', supplier_id)
    .eq('is_read', false)
    .select();
    
  if (!error && data) {
    await logAuditEvent(supplier_id, user_id, 'read_all_alerts', 'supplier_portal_alert', null, {
      count: data.length,
    });
  }
  
  return data?.length || 0;
}

// ============================================================================
// DISMISS ALERT
// ============================================================================

export async function dismissAlert(
  supplier_id: string,
  user_id: string,
  alert_id: string
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('supplier_portal_alerts')
    .update({ 
      is_dismissed: true, 
      dismissed_at: new Date().toISOString(),
    })
    .eq('id', alert_id)
    .eq('supplier_id', supplier_id);
    
  if (!error) {
    await logAuditEvent(supplier_id, user_id, 'dismiss_alert', 'supplier_portal_alert', alert_id, {});
  }
  
  return !error;
}

// ============================================================================
// CREATE ALERT
// ============================================================================

export async function createAlert(
  supplier_id: string,
  alert_type: AlertType,
  severity: AlertSeverity,
  title: string,
  message: string,
  details: Record<string, unknown> = {}
): Promise<string | null> {
  // Check for duplicate recent alert
  const { data: existing } = await supabaseAdmin
    .from('supplier_portal_alerts')
    .select('id')
    .eq('supplier_id', supplier_id)
    .eq('alert_type', alert_type)
    .eq('is_dismissed', false)
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .single();
    
  if (existing) {
    // Don't duplicate
    return null;
  }
  
  const { data, error } = await supabaseAdmin
    .from('supplier_portal_alerts')
    .insert({
      supplier_id,
      alert_type,
      severity,
      title,
      message,
      details,
    })
    .select()
    .single();
    
  if (error) return null;
  return data.id;
}

// ============================================================================
// GENERATE ALERTS FOR SUPPLIER
// ============================================================================

export async function generateSupplierAlerts(supplier_id: string): Promise<number> {
  let count = 0;
  
  // 1. Check reliability deterioration
  const { data: reliability } = await supabaseAdmin
    .from('supplier_forecasts')
    .select('forecast_band, forecast_score, predicted_direction')
    .eq('supplier_id', supplier_id)
    .eq('forecast_type', 'reliability_deterioration')
    .order('forecast_as_of', { ascending: false })
    .limit(1)
    .single();
    
  if (reliability && reliability.predicted_direction === 'deteriorating') {
    const alertId = await createAlert(
      supplier_id,
      'reliability_deterioration',
      reliability.forecast_band === 'high_risk' ? 'critical' : 'warning',
      'Reliability Score Declining',
      'Your reliability score is showing signs of deterioration. Improve data quality to maintain rankings.',
      { forecast_score: reliability.forecast_score, band: reliability.forecast_band }
    );
    if (alertId) count++;
  }
  
  // 2. Check stale offers
  const { data: staleOffers } = await supabaseAdmin
    .from('supplier_offers')
    .select('id')
    .eq('supplier_id', supplier_id)
    .eq('is_active', true)
    .lt('updated_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
    
  if (staleOffers && staleOffers.length >= 5) {
    const alertId = await createAlert(
      supplier_id,
      'stale_offers',
      staleOffers.length >= 20 ? 'critical' : 'warning',
      `${staleOffers.length} Stale Offers Need Updating`,
      'Update your pricing to maintain competitive rankings and accurate market data.',
      { stale_count: staleOffers.length }
    );
    if (alertId) count++;
  }
  
  // 3. Check low trust offers
  const { data: lowTrustOffers } = await supabaseAdmin
    .from('offer_trust_scores')
    .select('offer_id')
    .eq('supplier_id', supplier_id)
    .eq('trust_band', 'low_trust')
    .gte('calculated_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
    
  if (lowTrustOffers && lowTrustOffers.length >= 3) {
    const alertId = await createAlert(
      supplier_id,
      'low_trust_offers',
      'warning',
      `${lowTrustOffers.length} Low-Trust Offers Detected`,
      'Some of your offers have low trust scores. Review pricing and data accuracy to improve trust.',
      { low_trust_count: lowTrustOffers.length }
    );
    if (alertId) count++;
  }
  
  // 4. Check lost rank-1 positions
  const { data: lostRanks } = await supabaseAdmin
    .from('supplier_recommendations')
    .select('product_id')
    .eq('supplier_id', supplier_id)
    .neq('recommended_rank', 1)
    .gte('calculated_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
    
  const { data: hadRank1 } = await supabaseAdmin
    .from('supplier_recommendations')
    .select('product_id')
    .eq('supplier_id', supplier_id)
    .eq('recommended_rank', 1)
    .gte('calculated_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
    .lt('calculated_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
    
  if (hadRank1 && lostRanks) {
    const hadRank1Products = new Set(hadRank1.map(r => r.product_id));
    const lostProducts = lostRanks.filter(r => hadRank1Products.has(r.product_id));
    
    if (lostProducts.length >= 3) {
      const alertId = await createAlert(
        supplier_id,
        'lost_recommendation_rank',
        'warning',
        `Lost #1 Rank on ${lostProducts.length} Products`,
        'You have lost the top ranking position on some products. Review pricing competitiveness.',
        { lost_count: lostProducts.length }
      );
      if (alertId) count++;
    }
  }
  
  // 5. Check anomaly detections
  const { data: anomalies } = await supabaseAdmin
    .from('ai_pricing_analysis')
    .select('id')
    .eq('supplier_id', supplier_id)
    .eq('is_suspicious', true)
    .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
    
  if (anomalies && anomalies.length >= 3) {
    const alertId = await createAlert(
      supplier_id,
      'anomaly_detected',
      'info',
      `${anomalies.length} Pricing Anomalies Flagged`,
      'Your data has triggered anomaly alerts. This may affect trust scores.',
      { anomaly_count: anomalies.length }
    );
    if (alertId) count++;
  }
  
  return count;
}

// ============================================================================
// ALERT COUNTS
// ============================================================================

export async function getAlertCounts(supplier_id: string): Promise<{
  total: number;
  unread: number;
  critical: number;
  warning: number;
  info: number;
}> {
  const { data } = await supabaseAdmin
    .from('supplier_portal_alerts')
    .select('severity, is_read')
    .eq('supplier_id', supplier_id)
    .eq('is_dismissed', false);
    
  if (!data) {
    return { total: 0, unread: 0, critical: 0, warning: 0, info: 0 };
  }
  
  return {
    total: data.length,
    unread: data.filter(a => !a.is_read).length,
    critical: data.filter(a => a.severity === 'critical').length,
    warning: data.filter(a => a.severity === 'warning').length,
    info: data.filter(a => a.severity === 'info').length,
  };
}
