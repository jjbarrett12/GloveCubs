/**
 * Review Queue Priority Scoring
 * 
 * Implements intelligent prioritization for review items.
 */

import { supabaseAdmin } from '../jobs/supabase';

// ============================================================================
// TYPES
// ============================================================================

export type PriorityBand = 'critical' | 'high' | 'normal' | 'low';

export interface PriorityFactors {
  confidence_score?: number;
  estimated_margin_impact?: number;
  supplier_reliability_score?: number;
  price_spread_magnitude?: number;
  data_completeness?: number;
  issue_severity?: 'critical' | 'high' | 'medium' | 'low';
  review_type?: string;
  time_since_created_hours?: number;
}

export interface PriorityResult {
  priority_score: number;
  priority_band: PriorityBand;
  factors_breakdown: {
    factor: string;
    weight: number;
    value: number;
    contribution: number;
  }[];
}

// ============================================================================
// SCORING WEIGHTS
// ============================================================================

const PRIORITY_WEIGHTS = {
  confidence_inverse: 0.20,     // Lower confidence = higher priority
  margin_impact: 0.25,          // Higher margin impact = higher priority
  supplier_reliability: 0.10,   // Lower reliability = higher priority
  price_spread: 0.15,           // Larger spread = higher priority
  data_completeness: 0.10,      // Lower completeness = higher priority (needs attention)
  issue_severity: 0.15,         // Higher severity = higher priority
  age_factor: 0.05,             // Older items = slightly higher priority
};

const SEVERITY_SCORES: Record<string, number> = {
  critical: 1.0,
  high: 0.75,
  medium: 0.5,
  low: 0.25,
};

const REVIEW_TYPE_BASE_PRIORITY: Record<string, number> = {
  pricing: 0.8,         // Pricing issues can affect revenue immediately
  product_match: 0.7,   // Match errors can corrupt catalog
  catalog: 0.6,         // Catalog issues affect data quality
  supplier: 0.5,        // Supplier issues are important but less urgent
  audit: 0.4,           // Audit findings can wait a bit
  system: 0.3,          // System issues vary
};

// ============================================================================
// PRIORITY CALCULATION
// ============================================================================

export function calculateReviewPriority(factors: PriorityFactors): PriorityResult {
  const breakdown: PriorityResult['factors_breakdown'] = [];
  let totalScore = 0;
  
  // 1. Confidence factor (inverse - lower confidence = higher priority)
  if (factors.confidence_score !== undefined) {
    const inverseConf = 1 - Math.max(0, Math.min(1, factors.confidence_score));
    const contribution = inverseConf * PRIORITY_WEIGHTS.confidence_inverse;
    breakdown.push({
      factor: 'confidence_inverse',
      weight: PRIORITY_WEIGHTS.confidence_inverse,
      value: inverseConf,
      contribution,
    });
    totalScore += contribution;
  }
  
  // 2. Margin impact factor
  if (factors.estimated_margin_impact !== undefined) {
    // Normalize to 0-1 scale (assuming max impact of $1000)
    const normalizedImpact = Math.min(1, Math.abs(factors.estimated_margin_impact) / 1000);
    const contribution = normalizedImpact * PRIORITY_WEIGHTS.margin_impact;
    breakdown.push({
      factor: 'margin_impact',
      weight: PRIORITY_WEIGHTS.margin_impact,
      value: normalizedImpact,
      contribution,
    });
    totalScore += contribution;
  }
  
  // 3. Supplier reliability factor (inverse - lower reliability = higher priority)
  if (factors.supplier_reliability_score !== undefined) {
    const inverseReliability = 1 - Math.max(0, Math.min(1, factors.supplier_reliability_score));
    const contribution = inverseReliability * PRIORITY_WEIGHTS.supplier_reliability;
    breakdown.push({
      factor: 'supplier_reliability',
      weight: PRIORITY_WEIGHTS.supplier_reliability,
      value: inverseReliability,
      contribution,
    });
    totalScore += contribution;
  }
  
  // 4. Price spread magnitude
  if (factors.price_spread_magnitude !== undefined) {
    // Normalize spread (assuming max meaningful spread is 50%)
    const normalizedSpread = Math.min(1, Math.abs(factors.price_spread_magnitude) / 0.5);
    const contribution = normalizedSpread * PRIORITY_WEIGHTS.price_spread;
    breakdown.push({
      factor: 'price_spread',
      weight: PRIORITY_WEIGHTS.price_spread,
      value: normalizedSpread,
      contribution,
    });
    totalScore += contribution;
  }
  
  // 5. Data completeness factor (inverse - lower completeness = higher priority)
  if (factors.data_completeness !== undefined) {
    const inverseCompleteness = 1 - Math.max(0, Math.min(1, factors.data_completeness));
    const contribution = inverseCompleteness * PRIORITY_WEIGHTS.data_completeness;
    breakdown.push({
      factor: 'data_completeness',
      weight: PRIORITY_WEIGHTS.data_completeness,
      value: inverseCompleteness,
      contribution,
    });
    totalScore += contribution;
  }
  
  // 6. Issue severity
  if (factors.issue_severity) {
    const severityScore = SEVERITY_SCORES[factors.issue_severity] || 0.5;
    const contribution = severityScore * PRIORITY_WEIGHTS.issue_severity;
    breakdown.push({
      factor: 'issue_severity',
      weight: PRIORITY_WEIGHTS.issue_severity,
      value: severityScore,
      contribution,
    });
    totalScore += contribution;
  }
  
  // 7. Age factor
  if (factors.time_since_created_hours !== undefined) {
    // Cap at 72 hours for max age factor
    const normalizedAge = Math.min(1, factors.time_since_created_hours / 72);
    const contribution = normalizedAge * PRIORITY_WEIGHTS.age_factor;
    breakdown.push({
      factor: 'age_factor',
      weight: PRIORITY_WEIGHTS.age_factor,
      value: normalizedAge,
      contribution,
    });
    totalScore += contribution;
  }
  
  // Add review type base priority if available
  if (factors.review_type) {
    const baseMultiplier = REVIEW_TYPE_BASE_PRIORITY[factors.review_type] || 0.5;
    totalScore = totalScore * (0.5 + baseMultiplier * 0.5);
  }
  
  // Determine priority band
  const priority_band = determinePriorityBand(totalScore);
  
  return {
    priority_score: Math.round(totalScore * 100) / 100,
    priority_band,
    factors_breakdown: breakdown,
  };
}

function determinePriorityBand(score: number): PriorityBand {
  if (score >= 0.8) return 'critical';
  if (score >= 0.6) return 'high';
  if (score >= 0.3) return 'normal';
  return 'low';
}

// ============================================================================
// REVIEW ITEM PRIORITY UPDATE
// ============================================================================

export async function updateReviewItemPriority(
  review_id: string,
  factors: PriorityFactors
): Promise<PriorityResult> {
  const result = calculateReviewPriority(factors);
  const supabase = supabaseAdmin;
  
  const { error } = await supabase
    .from('review_queue')
    .update({
      priority_score: result.priority_score,
      priority_band: result.priority_band,
      updated_at: new Date().toISOString(),
    })
    .eq('id', review_id);
    
  if (error) {
    console.error('Failed to update review priority:', error);
  }
  
  return result;
}

export async function batchUpdateReviewPriorities(): Promise<{
  updated: number;
  errors: number;
}> {
  const supabase = supabaseAdmin;
  
  // Get all open review items
  const { data: reviews, error } = await supabase
    .from('review_queue')
    .select('*')
    .in('status', ['open', 'in_review']);
    
  if (error || !reviews) {
    console.error('Failed to fetch reviews for priority update:', error);
    return { updated: 0, errors: 1 };
  }
  
  let updated = 0;
  let errors = 0;
  
  for (const review of reviews) {
    try {
      const factors: PriorityFactors = {
        confidence_score: review.confidence || undefined,
        issue_severity: review.priority as PriorityFactors['issue_severity'],
        review_type: review.review_type,
        time_since_created_hours: (Date.now() - new Date(review.created_at).getTime()) / (1000 * 60 * 60),
      };
      
      // Extract additional factors from details JSON
      const details = review.details || {};
      if (details.margin_impact) {
        factors.estimated_margin_impact = details.margin_impact;
      }
      if (details.price_spread) {
        factors.price_spread_magnitude = details.price_spread;
      }
      if (details.data_completeness) {
        factors.data_completeness = details.data_completeness;
      }
      
      await updateReviewItemPriority(review.id, factors);
      updated++;
      
    } catch (e) {
      console.error(`Failed to update priority for review ${review.id}:`, e);
      errors++;
    }
  }
  
  return { updated, errors };
}

// ============================================================================
// PRIORITY-BASED RETRIEVAL
// ============================================================================

export async function getHighPriorityReviews(
  limit: number = 20
): Promise<Array<{
  id: string;
  title: string;
  review_type: string;
  priority_score: number;
  priority_band: PriorityBand;
  issue_category: string;
  created_at: string;
}>> {
  const supabase = supabaseAdmin;
  
  const { data, error } = await supabase
    .from('review_queue')
    .select('id, title, review_type, priority_score, priority_band, issue_category, created_at')
    .in('status', ['open', 'in_review'])
    .order('priority_score', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: true })
    .limit(limit);
    
  if (error) {
    console.error('Failed to get high priority reviews:', error);
    return [];
  }
  
  return data || [];
}

export async function getReviewsByPriorityBand(
  band: PriorityBand,
  limit: number = 50
): Promise<Array<{
  id: string;
  title: string;
  review_type: string;
  priority_score: number;
  issue_category: string;
}>> {
  const supabase = supabaseAdmin;
  
  const { data, error } = await supabase
    .from('review_queue')
    .select('id, title, review_type, priority_score, issue_category')
    .eq('priority_band', band)
    .in('status', ['open', 'in_review'])
    .order('priority_score', { ascending: false })
    .limit(limit);
    
  if (error) {
    console.error(`Failed to get ${band} priority reviews:`, error);
    return [];
  }
  
  return data || [];
}

// ============================================================================
// ENHANCED REVIEW ITEM CREATION WITH PRIORITY
// ============================================================================

export interface CreatePrioritizedReviewInput {
  review_type: string;
  source_table?: string;
  source_id?: string;
  title: string;
  issue_category: string;
  recommended_action?: string;
  agent_name?: string;
  details?: Record<string, unknown>;
  priority_factors: PriorityFactors;
}

export async function createPrioritizedReviewItem(
  input: CreatePrioritizedReviewInput
): Promise<string | null> {
  const supabase = supabaseAdmin;
  
  // Calculate priority
  const priority = calculateReviewPriority({
    ...input.priority_factors,
    review_type: input.review_type,
  });
  
  const { data, error } = await supabase
    .from('review_queue')
    .insert({
      review_type: input.review_type,
      source_table: input.source_table,
      source_id: input.source_id,
      title: input.title,
      issue_category: input.issue_category,
      recommended_action: input.recommended_action,
      agent_name: input.agent_name,
      confidence: input.priority_factors.confidence_score,
      details: {
        ...input.details,
        priority_factors: input.priority_factors,
        priority_breakdown: priority.factors_breakdown,
      },
      priority: input.priority_factors.issue_severity || 'medium',
      priority_score: priority.priority_score,
      priority_band: priority.priority_band,
      status: 'open',
    })
    .select('id')
    .single();
    
  if (error) {
    console.error('Failed to create prioritized review item:', error);
    return null;
  }
  
  return data?.id || null;
}
