/**
 * Recommendation Outcomes
 * 
 * Tracks actual outcomes of supplier recommendations for closed-loop learning.
 * 
 * SAFETY RULES:
 * - Never infer acceptance without evidence
 * - Never mix estimated with realized savings
 * - All writes are idempotent
 * - Preserve audit trail for all decisions
 */

import { supabaseAdmin } from '../jobs/supabase';
import { withAdvisoryLock } from '../hardening/transactions';
import { logRecommendationEngineError } from '../hardening/telemetry';

// ============================================================================
// TYPES
// ============================================================================

export type OutcomeStatus = 
  | 'pending' 
  | 'accepted' 
  | 'rejected' 
  | 'superseded' 
  | 'expired' 
  | 'partially_realized';

export type DecisionSource = 
  | 'operator' 
  | 'system' 
  | 'imported_order_data' 
  | 'manual_review';

export type SavingsConfidence = 'confirmed' | 'estimated' | 'unknown';

export interface RecommendationOutcome {
  id?: string;
  recommendation_id: string;
  product_id: string;
  supplier_id: string;
  offer_id: string;
  outcome_status: OutcomeStatus;
  decision_source?: DecisionSource;
  accepted?: boolean;
  accepted_at?: string;
  rejected_at?: string;
  rejection_reason?: string;
  selected_supplier_id?: string;
  selected_offer_id?: string;
  selected_price?: number;
  recommended_price?: number;
  recommended_rank?: number;
  recommended_trust_score?: number;
  recommended_reasoning?: string;
  price_delta?: number | null;
  trust_delta?: number | null;
  estimated_savings?: number | null;
  realized_savings?: number | null;
  realized_savings_percent?: number | null;
  savings_confidence?: SavingsConfidence;
  superseded_by_id?: string;
  supersedes_id?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export interface AcceptanceParams {
  recommendation_id: string;
  decision_source: DecisionSource;
  selected_supplier_id: string;
  selected_offer_id: string;
  selected_price: number;
  notes?: string;
}

export interface RejectionParams {
  recommendation_id: string;
  decision_source: DecisionSource;
  rejection_reason: string;
  selected_supplier_id?: string;
  selected_offer_id?: string;
  selected_price?: number;
  notes?: string;
}

// ============================================================================
// OUTCOME CREATION
// ============================================================================

/**
 * Create a pending outcome when a recommendation is generated.
 * This establishes the baseline for tracking.
 */
export async function createPendingOutcome(
  recommendation_id: string,
  product_id: string,
  supplier_id: string,
  offer_id: string,
  recommended_price: number,
  recommended_rank: number,
  recommended_trust_score: number,
  recommended_reasoning: string,
  estimated_savings?: number
): Promise<string | null> {
  // Check for existing outcome (idempotent)
  const { data: existing } = await supabaseAdmin
    .from('recommendation_outcomes')
    .select('id')
    .eq('recommendation_id', recommendation_id)
    .single();
    
  if (existing) {
    return existing.id;
  }
  
  const { data, error } = await supabaseAdmin
    .from('recommendation_outcomes')
    .insert({
      recommendation_id,
      product_id,
      supplier_id,
      offer_id,
      outcome_status: 'pending',
      recommended_price,
      recommended_rank,
      recommended_trust_score,
      recommended_reasoning,
      estimated_savings,
      savings_confidence: estimated_savings ? 'estimated' : 'unknown',
    })
    .select('id')
    .single();
    
  if (error) {
    console.error('Failed to create pending outcome:', error);
    return null;
  }
  
  return data?.id;
}

// ============================================================================
// OUTCOME CAPTURE WORKFLOWS
// ============================================================================

/**
 * Record acceptance of a recommendation.
 * 
 * RULES:
 * - Must have actual evidence of acceptance
 * - Must record the actual selected supplier/offer
 * - Calculates realized savings only if selected_price is known
 * - Uses advisory lock to prevent concurrent conflicts
 */
export async function recordRecommendationAcceptance(
  params: AcceptanceParams
): Promise<{ success: boolean; outcome_id?: string; error?: string }> {
  const { recommendation_id, decision_source, selected_supplier_id, selected_offer_id, selected_price, notes } = params;
  
  // Use advisory lock to prevent concurrent updates to same recommendation
  const lockResult = await withAdvisoryLock(
    'recommendation_outcome',
    recommendation_id,
    async () => {
      // Get the pending outcome
      const { data: outcome } = await supabaseAdmin
        .from('recommendation_outcomes')
        .select('*')
        .eq('recommendation_id', recommendation_id)
        .eq('outcome_status', 'pending')
        .single();
        
      if (!outcome) {
        // Check if already accepted (idempotent)
        const { data: existing } = await supabaseAdmin
          .from('recommendation_outcomes')
          .select('id')
          .eq('recommendation_id', recommendation_id)
          .eq('outcome_status', 'accepted')
          .single();
          
        if (existing) {
          return { success: true, outcome_id: existing.id };
        }
        
        return { success: false, error: 'No pending outcome found for this recommendation' };
      }
      
      // Calculate realized savings and deltas
      const recommended_price = Number(outcome.recommended_price) || 0;
      const price_delta = recommended_price > 0 ? selected_price - recommended_price : null;
      
      // Track whether recommended supplier was selected
      const isRecommendedSupplier = selected_supplier_id === outcome.supplier_id;
      
      // IMPORTANT: Do NOT copy estimated_savings to realized_savings here.
      // Realized savings can ONLY be set when actual order/procurement data is available
      // via updateRealizedSavings(). Mixing estimated and realized values corrupts metrics.
      const realized_savings: number | null = null;
      const realized_savings_percent: number | null = null;
      let savings_confidence: SavingsConfidence = 'unknown';
      
      if (isRecommendedSupplier && outcome.estimated_savings && recommended_price > 0) {
        // Mark savings as estimated - actual realized values come from order data later
        savings_confidence = 'estimated';
      }
      
      // Get trust score delta if selecting different supplier
      const trust_delta: number | null = null;
      
      const { data: updated, error } = await supabaseAdmin
        .from('recommendation_outcomes')
        .update({
          outcome_status: 'accepted',
          decision_source,
          accepted: true,
          accepted_at: new Date().toISOString(),
          selected_supplier_id,
          selected_offer_id,
          selected_price,
          price_delta,
          trust_delta,
          realized_savings,
          realized_savings_percent,
          savings_confidence,
          notes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', outcome.id)
        .select('id')
        .single();
        
      if (error) {
        return { success: false, error: error.message };
      }
      
      return { success: true, outcome_id: updated?.id };
    },
    { timeout_ms: 10000, retry_count: 3 }
  );
  
  if (!lockResult.success) {
    await logRecommendationEngineError('Failed to acquire lock for acceptance', {
      recommendation_id,
      operation: 'accept',
      error_code: 'LOCK_FAILED',
    });
    return { success: false, error: lockResult.error || 'Failed to acquire lock' };
  }
  
  return lockResult.result!;
}

/**
 * Record rejection of a recommendation.
 * 
 * RULES:
 * - Must capture rejection reason when known
 * - Must record the alternative selection if applicable
 * - Uses advisory lock to prevent concurrent conflicts
 */
export async function recordRecommendationRejection(
  params: RejectionParams
): Promise<{ success: boolean; outcome_id?: string; error?: string }> {
  const { 
    recommendation_id, 
    decision_source, 
    rejection_reason, 
    selected_supplier_id, 
    selected_offer_id, 
    selected_price,
    notes 
  } = params;
  
  // Use advisory lock to prevent concurrent updates to same recommendation
  const lockResult = await withAdvisoryLock(
    'recommendation_outcome',
    recommendation_id,
    async () => {
      // Get the pending outcome
      const { data: outcome } = await supabaseAdmin
        .from('recommendation_outcomes')
        .select('*')
        .eq('recommendation_id', recommendation_id)
        .eq('outcome_status', 'pending')
        .single();
        
      if (!outcome) {
        // Check if already rejected (idempotent)
        const { data: existing } = await supabaseAdmin
          .from('recommendation_outcomes')
          .select('id')
          .eq('recommendation_id', recommendation_id)
          .eq('outcome_status', 'rejected')
          .single();
          
        if (existing) {
          return { success: true, outcome_id: existing.id };
        }
        
        return { success: false, error: 'No pending outcome found for this recommendation' };
      }
      
      // Calculate price delta if alternative was selected
      const recommended_price = Number(outcome.recommended_price) || 0;
      const price_delta = selected_price && recommended_price > 0 
        ? selected_price - recommended_price 
        : null;
      
      // Calculate trust delta if alternative supplier was selected
      let trust_delta: number | null = null;
      if (selected_supplier_id && selected_supplier_id !== outcome.supplier_id && selected_offer_id) {
        const { data: trustScore } = await supabaseAdmin
          .from('offer_trust_scores')
          .select('trust_score')
          .eq('offer_id', selected_offer_id)
          .single();
        
        if (trustScore && outcome.recommended_trust_score) {
          trust_delta = Number(trustScore.trust_score) - Number(outcome.recommended_trust_score);
        }
      }
      
      const { data: updated, error } = await supabaseAdmin
        .from('recommendation_outcomes')
        .update({
          outcome_status: 'rejected',
          decision_source,
          accepted: false,
          rejected_at: new Date().toISOString(),
          rejection_reason,
          selected_supplier_id,
          selected_offer_id,
          selected_price,
          price_delta,
          trust_delta,
          savings_confidence: 'unknown',
          notes,
          metadata: {
            ...outcome.metadata,
            rejection_context: {
              recommended_supplier_id: outcome.supplier_id,
              recommended_offer_id: outcome.offer_id,
              recommended_price: outcome.recommended_price,
              recommended_trust: outcome.recommended_trust_score,
              alternative_selected: !!selected_supplier_id && selected_supplier_id !== outcome.supplier_id,
            },
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', outcome.id)
        .select('id')
        .single();
        
      if (error) {
        return { success: false, error: error.message };
      }
      
      return { success: true, outcome_id: updated?.id };
    },
    { timeout_ms: 10000, retry_count: 3 }
  );
  
  if (!lockResult.success) {
    await logRecommendationEngineError('Failed to acquire lock for rejection', {
      recommendation_id,
      operation: 'reject',
      error_code: 'LOCK_FAILED',
    });
    return { success: false, error: lockResult.error || 'Failed to acquire lock' };
  }
  
  return lockResult.result!;
}

/**
 * Record supersession of a recommendation.
 * 
 * When a newer recommendation replaces an older one for the same product.
 */
export async function recordRecommendationSuperseded(
  old_recommendation_id: string,
  new_recommendation_id: string
): Promise<{ success: boolean; error?: string }> {
  // Get the old pending outcome
  const { data: oldOutcome } = await supabaseAdmin
    .from('recommendation_outcomes')
    .select('id')
    .eq('recommendation_id', old_recommendation_id)
    .eq('outcome_status', 'pending')
    .single();
    
  if (!oldOutcome) {
    return { success: false, error: 'No pending outcome found for old recommendation' };
  }
  
  // Get the new outcome
  const { data: newOutcome } = await supabaseAdmin
    .from('recommendation_outcomes')
    .select('id')
    .eq('recommendation_id', new_recommendation_id)
    .single();
    
  const { error } = await supabaseAdmin
    .from('recommendation_outcomes')
    .update({
      outcome_status: 'superseded',
      superseded_by_id: newOutcome?.id,
      updated_at: new Date().toISOString(),
      notes: `Superseded by recommendation ${new_recommendation_id}`,
    })
    .eq('id', oldOutcome.id);
    
  if (error) {
    return { success: false, error: error.message };
  }
  
  // Link the new outcome back
  if (newOutcome) {
    await supabaseAdmin
      .from('recommendation_outcomes')
      .update({ supersedes_id: oldOutcome.id })
      .eq('id', newOutcome.id);
  }
  
  return { success: true };
}

/**
 * Expire stale pending recommendations.
 * 
 * Recommendations that haven't been acted upon within the expiry period
 * are marked as expired.
 */
export async function expireStaleRecommendations(
  expiry_days: number = 14
): Promise<{ expired: number; error?: string }> {
  try {
    const { data, error } = await supabaseAdmin.rpc('expire_stale_recommendations', {
      p_expiry_days: expiry_days,
    });
    
    if (error) {
      console.error('Failed to expire stale recommendations:', error);
      // Fallback: try direct update if RPC fails
      const cutoff = new Date(Date.now() - expiry_days * 24 * 60 * 60 * 1000).toISOString();
      const { data: fallbackData } = await supabaseAdmin
        .from('recommendation_outcomes')
        .update({
          outcome_status: 'expired',
          updated_at: new Date().toISOString(),
          notes: `Auto-expired after ${expiry_days} days (fallback)`,
        })
        .eq('outcome_status', 'pending')
        .lt('created_at', cutoff)
        .select('id');
      
      return { 
        expired: fallbackData?.length || 0, 
        error: `RPC failed, used fallback: ${error.message}` 
      };
    }
    
    return { expired: data || 0 };
  } catch (err) {
    console.error('Exception expiring stale recommendations:', err);
    return { 
      expired: 0, 
      error: err instanceof Error ? err.message : String(err) 
    };
  }
}

// ============================================================================
// REALIZED SAVINGS TRACKING
// ============================================================================

/**
 * Update realized savings when actual order/procurement data is available.
 * 
 * RULES:
 * - Only update if we have actual confirmed pricing data
 * - Mark confidence as 'confirmed' when using real order data
 * - Prices must be in the same unit basis (per-case, per-unit, etc.)
 */
export async function updateRealizedSavings(
  outcome_id: string,
  actual_price_paid: number,
  baseline_price: number, // What would have been paid without the recommendation
  source: 'imported_order_data' | 'manual_review',
  options?: {
    price_basis?: 'per_case' | 'per_unit' | 'per_order';
    quantity?: number;
    notes?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  if (actual_price_paid < 0 || baseline_price < 0) {
    return { success: false, error: 'Prices must be non-negative' };
  }
  
  // Sanity check: baseline should typically be >= actual (we saved money)
  // but allow inverse for cases where recommendation didn't result in savings
  if (baseline_price > 0 && actual_price_paid > baseline_price * 2) {
    // Actual is more than 2x baseline - likely a unit mismatch
    console.warn('Possible unit mismatch in realized savings:', {
      outcome_id,
      actual_price_paid,
      baseline_price,
      ratio: actual_price_paid / baseline_price,
    });
  }
  
  const realized_savings = baseline_price - actual_price_paid;
  const realized_savings_percent = baseline_price > 0 
    ? (realized_savings / baseline_price) * 100 
    : 0;
    
  const { error } = await supabaseAdmin
    .from('recommendation_outcomes')
    .update({
      realized_savings,
      realized_savings_percent,
      savings_confidence: 'confirmed',
      selected_price: actual_price_paid,
      decision_source: source,
      outcome_status: realized_savings > 0 ? 'accepted' : 'partially_realized',
      updated_at: new Date().toISOString(),
      metadata: {
        baseline_price,
        actual_price_paid,
        price_basis: options?.price_basis || 'unknown',
        quantity: options?.quantity,
        notes: options?.notes,
        confirmed_at: new Date().toISOString(),
      },
    })
    .eq('id', outcome_id);
    
  if (error) {
    return { success: false, error: error.message };
  }
  
  return { success: true };
}

// ============================================================================
// RETRIEVAL
// ============================================================================

export async function getOutcome(outcome_id: string): Promise<RecommendationOutcome | null> {
  const { data } = await supabaseAdmin
    .from('recommendation_outcomes')
    .select('*')
    .eq('id', outcome_id)
    .single();
    
  return data as RecommendationOutcome | null;
}

export async function getOutcomeByRecommendation(
  recommendation_id: string
): Promise<RecommendationOutcome | null> {
  const { data } = await supabaseAdmin
    .from('recommendation_outcomes')
    .select('*')
    .eq('recommendation_id', recommendation_id)
    .single();
    
  return data as RecommendationOutcome | null;
}

export async function getPendingOutcomes(limit: number = 50): Promise<RecommendationOutcome[]> {
  const { data } = await supabaseAdmin
    .from('recommendation_outcomes')
    .select('*')
    .eq('outcome_status', 'pending')
    .order('created_at', { ascending: false })
    .limit(limit);
    
  return (data || []) as RecommendationOutcome[];
}

export async function getAcceptedOutcomes(
  days: number = 30,
  limit: number = 50
): Promise<RecommendationOutcome[]> {
  const { data } = await supabaseAdmin
    .from('accepted_recommendations')
    .select('*')
    .gte('accepted_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
    .limit(limit);
    
  return (data || []) as RecommendationOutcome[];
}

export async function getRejectedOutcomes(
  days: number = 30,
  limit: number = 50
): Promise<RecommendationOutcome[]> {
  const { data } = await supabaseAdmin
    .from('rejected_recommendations')
    .select('*')
    .gte('rejected_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
    .limit(limit);
    
  return (data || []) as RecommendationOutcome[];
}

export async function getExpiringRecommendations(limit: number = 20): Promise<RecommendationOutcome[]> {
  const { data } = await supabaseAdmin
    .from('expiring_recommendations')
    .select('*')
    .limit(limit);
    
  return (data || []) as RecommendationOutcome[];
}

export async function getOutcomeSummary(window_days: number = 30): Promise<{
  total_outcomes: number;
  accepted_count: number;
  rejected_count: number;
  expired_count: number;
  superseded_count: number;
  pending_count: number;
  acceptance_rate: number;
  total_estimated_savings: number;
  total_realized_savings: number;
  savings_capture_rate: number;
}> {
  const { data } = await supabaseAdmin.rpc('get_outcome_summary', {
    p_window_days: window_days,
  });
  
  if (!data || data.length === 0) {
    return {
      total_outcomes: 0,
      accepted_count: 0,
      rejected_count: 0,
      expired_count: 0,
      superseded_count: 0,
      pending_count: 0,
      acceptance_rate: 0,
      total_estimated_savings: 0,
      total_realized_savings: 0,
      savings_capture_rate: 0,
    };
  }
  
  const row = data[0];
  return {
    total_outcomes: Number(row.total_outcomes) || 0,
    accepted_count: Number(row.accepted_count) || 0,
    rejected_count: Number(row.rejected_count) || 0,
    expired_count: Number(row.expired_count) || 0,
    superseded_count: Number(row.superseded_count) || 0,
    pending_count: Number(row.pending_count) || 0,
    acceptance_rate: Number(row.acceptance_rate) || 0,
    total_estimated_savings: Number(row.total_estimated_savings) || 0,
    total_realized_savings: Number(row.total_realized_savings) || 0,
    savings_capture_rate: Number(row.savings_capture_rate) || 0,
  };
}
