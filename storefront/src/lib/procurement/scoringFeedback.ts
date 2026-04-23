/**
 * Scoring Feedback Integration
 * 
 * Feeds recommendation outcomes back into the scoring systems.
 * 
 * RULES:
 * - Conservative adjustments only
 * - Use weighted signals, not single-run overrides
 * - Require minimum sample sizes before adjusting
 * - Preserve auditability
 */

import { supabaseAdmin } from '../jobs/supabase';

// ============================================================================
// TYPES
// ============================================================================

export type AdjustmentType = 
  | 'supplier_reliability_penalty'
  | 'supplier_reliability_bonus'
  | 'offer_trust_penalty'
  | 'offer_trust_bonus'
  | 'recommendation_weight_adjustment'
  | 'alert_precision_adjustment'
  | 'opportunity_confidence_adjustment';

export interface ScoringAdjustment {
  id?: string;
  adjustment_type: AdjustmentType;
  entity_type: string;
  entity_id: string;
  adjustment_value: number;
  reason: string;
  sample_size: number;
  confidence: number;
  effective_from?: string;
  effective_until?: string;
  applied?: boolean;
  metadata?: Record<string, unknown>;
}

export interface FeedbackPattern {
  entity_type: string;
  entity_id: string;
  pattern_type: string;
  count: number;
  rate: number;
  sample_size: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const FEEDBACK_CONFIG = {
  // Minimum samples before generating adjustments
  min_sample_size: 20,           // Increased from 10 for better statistical validity
  
  // Minimum samples for high confidence
  high_confidence_sample_size: 100, // Confidence reaches 100% at 100 samples
  
  // Thresholds for pattern detection
  high_override_rate: 0.4,       // 40% override rate triggers penalty
  low_acceptance_rate: 0.3,      // 30% acceptance rate triggers penalty
  high_acceptance_rate: 0.8,     // 80% acceptance rate triggers bonus
  repeated_rejection_count: 5,   // Increased from 3 - need stronger signal
  
  // Adjustment magnitudes (conservative)
  penalty_magnitude: 0.05,       // 5% penalty
  bonus_magnitude: 0.03,         // 3% bonus
  max_adjustment: 0.15,          // 15% max cumulative adjustment
  
  // Scaling for repeated patterns
  scaling_factor: 0.02,          // Additional penalty per rejection beyond threshold
  max_scaled_penalty: 0.12,      // Cap scaled penalty at 12%
  
  // Decay
  adjustment_decay_days: 90,     // Adjustments decay after 90 days
};

// ============================================================================
// PATTERN DETECTION
// ============================================================================

/**
 * Analyze outcomes to identify patterns that should feed back into scoring.
 */
export async function detectFeedbackPatterns(
  window_days: number = 30
): Promise<FeedbackPattern[]> {
  const patterns: FeedbackPattern[] = [];
  const window_start = new Date(Date.now() - window_days * 24 * 60 * 60 * 1000).toISOString();
  
  // Pattern 1: Suppliers with high override rates
  const overridePatterns = await detectSupplierOverridePatterns(window_start);
  patterns.push(...overridePatterns);
  
  // Pattern 2: Suppliers with consistent rejection
  const rejectionPatterns = await detectSupplierRejectionPatterns(window_start);
  patterns.push(...rejectionPatterns);
  
  // Pattern 3: Suppliers with high acceptance rates (positive signal)
  const acceptancePatterns = await detectSupplierAcceptancePatterns(window_start);
  patterns.push(...acceptancePatterns);
  
  // Pattern 4: Low-trust offers repeatedly rejected
  const trustPatterns = await detectLowTrustRejectionPatterns(window_start);
  patterns.push(...trustPatterns);
  
  // Pattern 5: Margin opportunities rarely accepted
  const opportunityPatterns = await detectOpportunityRejectionPatterns(window_start);
  patterns.push(...opportunityPatterns);
  
  return patterns;
}

async function detectSupplierOverridePatterns(window_start: string): Promise<FeedbackPattern[]> {
  const patterns: FeedbackPattern[] = [];
  
  // Get acceptance outcomes where operator chose a different supplier
  const { data: outcomes } = await supabaseAdmin
    .from('recommendation_outcomes')
    .select('supplier_id, selected_supplier_id')
    .eq('outcome_status', 'accepted')
    .gte('created_at', window_start);
    
  if (!outcomes) return [];
  
  // Group by supplier
  const supplierStats: Record<string, { total: number; overridden: number }> = {};
  
  for (const o of outcomes) {
    const supplierId = o.supplier_id;
    if (!supplierStats[supplierId]) {
      supplierStats[supplierId] = { total: 0, overridden: 0 };
    }
    supplierStats[supplierId].total++;
    if (o.selected_supplier_id && o.selected_supplier_id !== supplierId) {
      supplierStats[supplierId].overridden++;
    }
  }
  
  // Identify high override suppliers
  for (const [supplierId, stats] of Object.entries(supplierStats)) {
    if (stats.total >= FEEDBACK_CONFIG.min_sample_size) {
      const overrideRate = stats.overridden / stats.total;
      if (overrideRate >= FEEDBACK_CONFIG.high_override_rate) {
        patterns.push({
          entity_type: 'supplier',
          entity_id: supplierId,
          pattern_type: 'high_override_rate',
          count: stats.overridden,
          rate: overrideRate,
          sample_size: stats.total,
        });
      }
    }
  }
  
  return patterns;
}

async function detectSupplierRejectionPatterns(window_start: string): Promise<FeedbackPattern[]> {
  const patterns: FeedbackPattern[] = [];
  
  const { data: outcomes } = await supabaseAdmin
    .from('recommendation_outcomes')
    .select('supplier_id, outcome_status')
    .in('outcome_status', ['accepted', 'rejected'])
    .gte('created_at', window_start);
    
  if (!outcomes) return [];
  
  const supplierStats: Record<string, { accepted: number; rejected: number }> = {};
  
  for (const o of outcomes) {
    const supplierId = o.supplier_id;
    if (!supplierStats[supplierId]) {
      supplierStats[supplierId] = { accepted: 0, rejected: 0 };
    }
    if (o.outcome_status === 'accepted') supplierStats[supplierId].accepted++;
    if (o.outcome_status === 'rejected') supplierStats[supplierId].rejected++;
  }
  
  for (const [supplierId, stats] of Object.entries(supplierStats)) {
    const total = stats.accepted + stats.rejected;
    if (total >= FEEDBACK_CONFIG.min_sample_size) {
      const acceptanceRate = stats.accepted / total;
      if (acceptanceRate <= FEEDBACK_CONFIG.low_acceptance_rate) {
        patterns.push({
          entity_type: 'supplier',
          entity_id: supplierId,
          pattern_type: 'low_acceptance_rate',
          count: stats.rejected,
          rate: 1 - acceptanceRate,
          sample_size: total,
        });
      }
    }
  }
  
  return patterns;
}

async function detectSupplierAcceptancePatterns(window_start: string): Promise<FeedbackPattern[]> {
  const patterns: FeedbackPattern[] = [];
  
  const { data: outcomes } = await supabaseAdmin
    .from('recommendation_outcomes')
    .select('supplier_id, outcome_status')
    .in('outcome_status', ['accepted', 'rejected'])
    .gte('created_at', window_start);
    
  if (!outcomes) return [];
  
  const supplierStats: Record<string, { accepted: number; rejected: number }> = {};
  
  for (const o of outcomes) {
    const supplierId = o.supplier_id;
    if (!supplierStats[supplierId]) {
      supplierStats[supplierId] = { accepted: 0, rejected: 0 };
    }
    if (o.outcome_status === 'accepted') supplierStats[supplierId].accepted++;
    if (o.outcome_status === 'rejected') supplierStats[supplierId].rejected++;
  }
  
  for (const [supplierId, stats] of Object.entries(supplierStats)) {
    const total = stats.accepted + stats.rejected;
    if (total >= FEEDBACK_CONFIG.min_sample_size) {
      const acceptanceRate = stats.accepted / total;
      if (acceptanceRate >= FEEDBACK_CONFIG.high_acceptance_rate) {
        patterns.push({
          entity_type: 'supplier',
          entity_id: supplierId,
          pattern_type: 'high_acceptance_rate',
          count: stats.accepted,
          rate: acceptanceRate,
          sample_size: total,
        });
      }
    }
  }
  
  return patterns;
}

async function detectLowTrustRejectionPatterns(window_start: string): Promise<FeedbackPattern[]> {
  const patterns: FeedbackPattern[] = [];
  
  const { data: outcomes } = await supabaseAdmin
    .from('recommendation_outcomes')
    .select('offer_id, recommended_trust_score, outcome_status, rejection_reason')
    .eq('outcome_status', 'rejected')
    .lt('recommended_trust_score', 0.6)
    .gte('created_at', window_start);
    
  // Need at least some rejections to analyze
  if (!outcomes || outcomes.length < 3) return [];
  
  // Group by offer
  const offerRejections: Record<string, number> = {};
  
  for (const o of outcomes) {
    offerRejections[o.offer_id] = (offerRejections[o.offer_id] || 0) + 1;
  }
  
  for (const [offerId, count] of Object.entries(offerRejections)) {
    // Use repeated_rejection_count threshold (now 5)
    if (count >= FEEDBACK_CONFIG.repeated_rejection_count) {
      patterns.push({
        entity_type: 'offer',
        entity_id: offerId,
        pattern_type: 'repeated_low_trust_rejection',
        count,
        rate: 1, // 100% rejection for these specific offers
        sample_size: count,
      });
    }
  }
  
  return patterns;
}

async function detectOpportunityRejectionPatterns(window_start: string): Promise<FeedbackPattern[]> {
  const patterns: FeedbackPattern[] = [];
  
  // Check if major margin opportunities are frequently rejected
  const { data: outcomes } = await supabaseAdmin
    .from('recommendation_outcomes')
    .select('product_id, estimated_savings, outcome_status')
    .in('outcome_status', ['accepted', 'rejected'])
    .gt('estimated_savings', 0)
    .gte('created_at', window_start);
    
  if (!outcomes || outcomes.length < FEEDBACK_CONFIG.min_sample_size) return [];
  
  // Group by product
  const productStats: Record<string, { accepted: number; rejected: number; total_savings: number }> = {};
  
  for (const o of outcomes) {
    const productId = o.product_id;
    if (!productStats[productId]) {
      productStats[productId] = { accepted: 0, rejected: 0, total_savings: 0 };
    }
    productStats[productId].total_savings += Number(o.estimated_savings) || 0;
    if (o.outcome_status === 'accepted') productStats[productId].accepted++;
    if (o.outcome_status === 'rejected') productStats[productId].rejected++;
  }
  
  for (const [productId, stats] of Object.entries(productStats)) {
    const total = stats.accepted + stats.rejected;
    if (total >= 5 && stats.rejected > stats.accepted) {
      patterns.push({
        entity_type: 'product',
        entity_id: productId,
        pattern_type: 'opportunity_frequently_rejected',
        count: stats.rejected,
        rate: stats.rejected / total,
        sample_size: total,
      });
    }
  }
  
  return patterns;
}

// ============================================================================
// ADJUSTMENT GENERATION
// ============================================================================

/**
 * Generate scoring adjustments from detected patterns.
 */
export async function generateScoringAdjustments(
  patterns: FeedbackPattern[]
): Promise<ScoringAdjustment[]> {
  const adjustments: ScoringAdjustment[] = [];
  
  for (const pattern of patterns) {
    const adjustment = patternToAdjustment(pattern);
    if (adjustment) {
      // Check for existing active adjustment
      const existing = await getActiveAdjustment(
        adjustment.adjustment_type,
        adjustment.entity_type,
        adjustment.entity_id
      );
      
      if (!existing) {
        adjustments.push(adjustment);
      }
    }
  }
  
  // Persist new adjustments
  for (const adj of adjustments) {
    await persistAdjustment(adj);
  }
  
  return adjustments;
}

function patternToAdjustment(pattern: FeedbackPattern): ScoringAdjustment | null {
  // Confidence reaches 100% at high_confidence_sample_size (100), not 50
  const confidence = Math.min(1, pattern.sample_size / FEEDBACK_CONFIG.high_confidence_sample_size);
  
  switch (pattern.pattern_type) {
    case 'high_override_rate':
      return {
        adjustment_type: 'supplier_reliability_penalty',
        entity_type: pattern.entity_type,
        entity_id: pattern.entity_id,
        adjustment_value: -Math.min(pattern.rate * FEEDBACK_CONFIG.penalty_magnitude, FEEDBACK_CONFIG.max_adjustment),
        reason: `Recommendations frequently overridden (${(pattern.rate * 100).toFixed(1)}% override rate)`,
        sample_size: pattern.sample_size,
        confidence,
        effective_from: new Date().toISOString(),
        effective_until: new Date(Date.now() + FEEDBACK_CONFIG.adjustment_decay_days * 24 * 60 * 60 * 1000).toISOString(),
      };
      
    case 'low_acceptance_rate':
      return {
        adjustment_type: 'supplier_reliability_penalty',
        entity_type: pattern.entity_type,
        entity_id: pattern.entity_id,
        adjustment_value: -Math.min(pattern.rate * FEEDBACK_CONFIG.penalty_magnitude, FEEDBACK_CONFIG.max_adjustment),
        reason: `Low recommendation acceptance rate (${((1 - pattern.rate) * 100).toFixed(1)}% accepted)`,
        sample_size: pattern.sample_size,
        confidence,
        effective_from: new Date().toISOString(),
        effective_until: new Date(Date.now() + FEEDBACK_CONFIG.adjustment_decay_days * 24 * 60 * 60 * 1000).toISOString(),
      };
      
    case 'high_acceptance_rate':
      return {
        adjustment_type: 'supplier_reliability_bonus',
        entity_type: pattern.entity_type,
        entity_id: pattern.entity_id,
        adjustment_value: Math.min(pattern.rate * FEEDBACK_CONFIG.bonus_magnitude, FEEDBACK_CONFIG.max_adjustment),
        reason: `High recommendation acceptance rate (${(pattern.rate * 100).toFixed(1)}% accepted)`,
        sample_size: pattern.sample_size,
        confidence,
        effective_from: new Date().toISOString(),
        effective_until: new Date(Date.now() + FEEDBACK_CONFIG.adjustment_decay_days * 24 * 60 * 60 * 1000).toISOString(),
      };
      
    case 'repeated_low_trust_rejection': {
      // Scaled penalty: base 5% + 2% per rejection beyond threshold, capped at 12%
      const rejectionsOverThreshold = Math.max(0, pattern.count - FEEDBACK_CONFIG.repeated_rejection_count);
      const scaledPenalty = Math.min(
        FEEDBACK_CONFIG.penalty_magnitude + (rejectionsOverThreshold * FEEDBACK_CONFIG.scaling_factor),
        FEEDBACK_CONFIG.max_scaled_penalty
      );
      
      return {
        adjustment_type: 'offer_trust_penalty',
        entity_type: pattern.entity_type,
        entity_id: pattern.entity_id,
        adjustment_value: -scaledPenalty,
        reason: `Offer rejected ${pattern.count} times (${rejectionsOverThreshold} beyond threshold), low trust confirmed`,
        sample_size: pattern.sample_size,
        confidence,
        effective_from: new Date().toISOString(),
        effective_until: new Date(Date.now() + FEEDBACK_CONFIG.adjustment_decay_days * 24 * 60 * 60 * 1000).toISOString(),
      };
    }
      
    case 'opportunity_frequently_rejected':
      return {
        adjustment_type: 'opportunity_confidence_adjustment',
        entity_type: pattern.entity_type,
        entity_id: pattern.entity_id,
        adjustment_value: -Math.min(pattern.rate * FEEDBACK_CONFIG.penalty_magnitude, FEEDBACK_CONFIG.max_adjustment),
        reason: `Margin opportunity frequently rejected (${(pattern.rate * 100).toFixed(1)}% rejection rate)`,
        sample_size: pattern.sample_size,
        confidence,
        effective_from: new Date().toISOString(),
        effective_until: new Date(Date.now() + FEEDBACK_CONFIG.adjustment_decay_days * 24 * 60 * 60 * 1000).toISOString(),
      };
      
    default:
      return null;
  }
}

// ============================================================================
// ADJUSTMENT APPLICATION
// ============================================================================

/**
 * Get the effective adjustment for a given entity.
 * Used by scoring functions to incorporate feedback.
 */
export async function getEffectiveAdjustment(
  adjustment_type: AdjustmentType,
  entity_type: string,
  entity_id: string
): Promise<number> {
  const now = new Date().toISOString();
  
  const { data } = await supabaseAdmin
    .from('scoring_feedback_adjustments')
    .select('adjustment_value, confidence')
    .eq('adjustment_type', adjustment_type)
    .eq('entity_type', entity_type)
    .eq('entity_id', entity_id)
    .lte('effective_from', now)
    .or(`effective_until.is.null,effective_until.gt.${now}`)
    .order('created_at', { ascending: false })
    .limit(1);
    
  if (!data || data.length === 0) return 0;
  
  // Weight adjustment by confidence
  return Number(data[0].adjustment_value) * Number(data[0].confidence);
}

/**
 * Get all active adjustments for a supplier (for reliability scoring).
 * 
 * NOTE: We use the STRONGEST adjustment of each type, not cumulative sums,
 * to prevent excessive compounding of similar penalties.
 */
export async function getSupplierAdjustments(supplier_id: string): Promise<{
  reliability_adjustment: number;
  reasons: string[];
  adjustment_sources: number;
}> {
  const now = new Date().toISOString();
  
  const { data } = await supabaseAdmin
    .from('scoring_feedback_adjustments')
    .select('adjustment_type, adjustment_value, confidence, reason')
    .eq('entity_type', 'supplier')
    .eq('entity_id', supplier_id)
    .in('adjustment_type', ['supplier_reliability_penalty', 'supplier_reliability_bonus'])
    .lte('effective_from', now)
    .or(`effective_until.is.null,effective_until.gt.${now}`);
    
  if (!data || data.length === 0) {
    return { reliability_adjustment: 0, reasons: [], adjustment_sources: 0 };
  }
  
  // Group by adjustment type and take strongest of each type
  const byType: Record<string, { value: number; reason: string }> = {};
  
  for (const adj of data) {
    const effectiveValue = Number(adj.adjustment_value) * Number(adj.confidence);
    const existing = byType[adj.adjustment_type];
    
    // Take the most severe adjustment of each type
    if (!existing || Math.abs(effectiveValue) > Math.abs(existing.value)) {
      byType[adj.adjustment_type] = { value: effectiveValue, reason: adj.reason };
    }
  }
  
  let total = 0;
  const reasons: string[] = [];
  
  for (const [type, adj] of Object.entries(byType)) {
    total += adj.value;
    reasons.push(`[${type}] ${adj.reason}`);
  }
  
  // Cap at max adjustment
  total = Math.max(-FEEDBACK_CONFIG.max_adjustment, Math.min(FEEDBACK_CONFIG.max_adjustment, total));
  
  return { 
    reliability_adjustment: total, 
    reasons,
    adjustment_sources: Object.keys(byType).length,
  };
}

/**
 * Get all active adjustments for an offer (for trust scoring).
 * 
 * NOTE: We use the STRONGEST adjustment of each type, not cumulative sums,
 * to prevent excessive compounding of similar penalties.
 */
export async function getOfferAdjustments(offer_id: string): Promise<{
  trust_adjustment: number;
  reasons: string[];
  adjustment_sources: number;
}> {
  const now = new Date().toISOString();
  
  const { data } = await supabaseAdmin
    .from('scoring_feedback_adjustments')
    .select('adjustment_type, adjustment_value, confidence, reason')
    .eq('entity_type', 'offer')
    .eq('entity_id', offer_id)
    .in('adjustment_type', ['offer_trust_penalty', 'offer_trust_bonus'])
    .lte('effective_from', now)
    .or(`effective_until.is.null,effective_until.gt.${now}`);
    
  if (!data || data.length === 0) {
    return { trust_adjustment: 0, reasons: [], adjustment_sources: 0 };
  }
  
  // Group by adjustment type and take strongest of each type
  const byType: Record<string, { value: number; reason: string }> = {};
  
  for (const adj of data) {
    const effectiveValue = Number(adj.adjustment_value) * Number(adj.confidence);
    const existing = byType[adj.adjustment_type];
    
    // Take the most severe adjustment of each type
    if (!existing || Math.abs(effectiveValue) > Math.abs(existing.value)) {
      byType[adj.adjustment_type] = { value: effectiveValue, reason: adj.reason };
    }
  }
  
  let total = 0;
  const reasons: string[] = [];
  
  for (const [type, adj] of Object.entries(byType)) {
    total += adj.value;
    reasons.push(`[${type}] ${adj.reason}`);
  }
  
  total = Math.max(-FEEDBACK_CONFIG.max_adjustment, Math.min(FEEDBACK_CONFIG.max_adjustment, total));
  
  return { 
    trust_adjustment: total, 
    reasons,
    adjustment_sources: Object.keys(byType).length,
  };
}

// ============================================================================
// PERSISTENCE
// ============================================================================

async function persistAdjustment(adjustment: ScoringAdjustment): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('scoring_feedback_adjustments')
    .insert({
      adjustment_type: adjustment.adjustment_type,
      entity_type: adjustment.entity_type,
      entity_id: adjustment.entity_id,
      adjustment_value: adjustment.adjustment_value,
      reason: adjustment.reason,
      sample_size: adjustment.sample_size,
      confidence: adjustment.confidence,
      effective_from: adjustment.effective_from,
      effective_until: adjustment.effective_until,
      metadata: adjustment.metadata,
    })
    .select('id')
    .single();
    
  if (error) {
    console.error('Failed to persist adjustment:', error);
    return null;
  }
  
  return data?.id;
}

async function getActiveAdjustment(
  adjustment_type: AdjustmentType,
  entity_type: string,
  entity_id: string
): Promise<ScoringAdjustment | null> {
  const now = new Date().toISOString();
  
  const { data } = await supabaseAdmin
    .from('scoring_feedback_adjustments')
    .select('*')
    .eq('adjustment_type', adjustment_type)
    .eq('entity_type', entity_type)
    .eq('entity_id', entity_id)
    .lte('effective_from', now)
    .or(`effective_until.is.null,effective_until.gt.${now}`)
    .limit(1);
    
  if (!data || data.length === 0) return null;
  
  return data[0] as ScoringAdjustment;
}

// ============================================================================
// BATCH PROCESSING
// ============================================================================

/**
 * Run the full feedback cycle.
 * Call during nightly jobs.
 */
export async function runFeedbackCycle(window_days: number = 30): Promise<{
  patterns_detected: number;
  adjustments_created: number;
}> {
  // Detect patterns
  const patterns = await detectFeedbackPatterns(window_days);
  
  // Generate adjustments
  const adjustments = await generateScoringAdjustments(patterns);
  
  return {
    patterns_detected: patterns.length,
    adjustments_created: adjustments.length,
  };
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clean up expired adjustments.
 */
export async function cleanupExpiredAdjustments(): Promise<number> {
  const now = new Date().toISOString();
  
  const { data } = await supabaseAdmin
    .from('scoring_feedback_adjustments')
    .delete()
    .lt('effective_until', now)
    .select('id');
    
  return data?.length || 0;
}
