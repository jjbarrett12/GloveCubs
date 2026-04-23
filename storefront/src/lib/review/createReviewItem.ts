/**
 * Review Queue - Create Review Item
 * 
 * Creates items in the review queue with deduplication.
 */

import { supabaseAdmin } from '../jobs/supabase';
import { logger } from '../jobs/logger';
import type { ReviewQueueCreateInput, ReviewQueueRow } from '../agents/types';

/**
 * Create a review queue item with deduplication
 * Uses atomic database function to prevent race conditions
 */
export async function createReviewItem(
  input: ReviewQueueCreateInput
): Promise<ReviewQueueRow | null> {
  // Validate required fields
  if (!input.title || !input.issue_category || !input.issue_summary) {
    logger.error('Invalid review item input', {
      missing: [
        !input.title && 'title',
        !input.issue_category && 'issue_category',
        !input.issue_summary && 'issue_summary',
      ].filter(Boolean),
    });
    return null;
  }

  // Use atomic function for deduplication safety
  const { data, error } = await supabaseAdmin.rpc('create_review_item_atomic', {
    p_review_type: input.review_type,
    p_priority: input.priority,
    p_source_table: input.source_table ?? null,
    p_source_id: input.source_id ?? null,
    p_title: input.title,
    p_issue_category: input.issue_category,
    p_issue_summary: input.issue_summary,
    p_recommended_action: input.recommended_action ?? null,
    p_agent_name: input.agent_name ?? null,
    p_confidence: input.confidence ?? null,
    p_details: input.details ?? {},
  });

  if (error) {
    // Handle unique constraint violation gracefully (duplicate)
    if (error.code === '23505') {
      logger.debug('Review item deduplicated by constraint', {
        source: `${input.source_table}:${input.source_id}`,
      });
      return null;
    }
    logger.error('Failed to create review item', {
      error: error.message,
      title: input.title,
    });
    return null;
  }

  const result = data?.[0];
  if (!result) {
    return null;
  }

  if (result.dedupe_matched) {
    logger.debug('Review item deduplicated', {
      source: `${input.source_table}:${input.source_id}`,
      existing_id: result.review_id,
    });
    return null;
  }

  // Fetch full record
  const { data: review } = await supabaseAdmin
    .from('review_queue')
    .select('*')
    .eq('id', result.review_id)
    .single();

  logger.info('Review item created', {
    id: result.review_id,
    type: input.review_type,
    priority: input.priority,
    category: input.issue_category,
  });

  return review as ReviewQueueRow;
}

/**
 * Create multiple review items
 */
export async function createReviewItems(
  inputs: ReviewQueueCreateInput[]
): Promise<ReviewQueueRow[]> {
  const created: ReviewQueueRow[] = [];

  for (const input of inputs) {
    const item = await createReviewItem(input);
    if (item) {
      created.push(item);
    }
  }

  return created;
}

/**
 * Prioritize review item
 */
export function determineReviewPriority(
  issueCategory: string,
  confidence?: number
): 'low' | 'medium' | 'high' | 'critical' {
  // Critical categories
  const criticalCategories = ['map_violation', 'margin_violation', 'legal_risk'];
  if (criticalCategories.includes(issueCategory)) {
    return 'critical';
  }

  // High priority categories
  const highCategories = ['supplier_legitimacy', 'duplicate_product', 'critical_conflict'];
  if (highCategories.includes(issueCategory)) {
    return 'high';
  }

  // Low confidence always needs more attention
  if (confidence !== undefined && confidence < 0.50) {
    return 'high';
  }

  // Medium priority categories
  const mediumCategories = ['ambiguous_match', 'pricing_review_required', 'unknown_shipping'];
  if (mediumCategories.includes(issueCategory)) {
    return 'medium';
  }

  // Default to low
  return 'low';
}
