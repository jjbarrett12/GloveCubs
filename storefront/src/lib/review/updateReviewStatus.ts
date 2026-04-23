/**
 * Review Queue - Update Status
 * 
 * Handles review item status transitions and resolution.
 */

import { supabaseAdmin } from '../jobs/supabase';
import { logger } from '../jobs/logger';
import { emitSystemEvent } from '../events/emit';
import { captureReviewResolutionFeedback } from '../ai/feedback';
import type { ReviewStatus, ReviewQueueRow, ReviewQueueUpdateInput } from '../agents/types';

/**
 * Update review item status
 */
export async function updateReviewStatus(
  reviewId: string,
  update: ReviewQueueUpdateInput
): Promise<ReviewQueueRow | null> {
  const updateData: Record<string, unknown> = {};

  if (update.status) {
    updateData.status = update.status;
    
    if (['approved', 'rejected', 'resolved'].includes(update.status)) {
      updateData.resolved_at = new Date().toISOString();
    }
  }

  if (update.priority) {
    updateData.priority = update.priority;
  }

  if (update.assigned_to !== undefined) {
    updateData.assigned_to = update.assigned_to;
  }

  if (update.resolved_by) {
    updateData.resolved_by = update.resolved_by;
  }

  if (update.resolved_notes) {
    updateData.resolved_notes = update.resolved_notes;
  }

  const { data, error } = await supabaseAdmin
    .from('review_queue')
    .update(updateData)
    .eq('id', reviewId)
    .select()
    .single();

  if (error) {
    logger.error('Failed to update review status', {
      review_id: reviewId,
      error: error.message,
    });
    return null;
  }

  logger.info('Review status updated', {
    review_id: reviewId,
    new_status: update.status,
  });

  // Emit event for resolved items
  if (update.status && ['approved', 'rejected', 'resolved'].includes(update.status)) {
    await emitSystemEvent({
      event_type: 'manual_review_resolved',
      source_table: 'review_queue',
      source_id: reviewId,
      payload: {
        review_type: data.review_type,
        status: update.status,
        resolved_by: update.resolved_by,
        original_source_table: data.source_table,
        original_source_id: data.source_id,
        approved: update.status === 'approved',
      },
    });

    // Capture feedback for AI learning loop
    if (data.source_table && data.source_id) {
      await captureReviewResolutionFeedback(
        reviewId,
        data.review_type,
        data.source_table,
        data.source_id,
        update.status as 'approved' | 'rejected' | 'resolved',
        update.resolved_notes,
        update.resolved_by
      );
    }
  }

  return data as ReviewQueueRow;
}

/**
 * Approve a review item
 */
export async function approveReview(
  reviewId: string,
  resolvedBy: string,
  notes?: string
): Promise<ReviewQueueRow | null> {
  return updateReviewStatus(reviewId, {
    status: 'approved',
    resolved_by: resolvedBy,
    resolved_notes: notes,
  });
}

/**
 * Reject a review item
 */
export async function rejectReview(
  reviewId: string,
  resolvedBy: string,
  notes?: string
): Promise<ReviewQueueRow | null> {
  return updateReviewStatus(reviewId, {
    status: 'rejected',
    resolved_by: resolvedBy,
    resolved_notes: notes,
  });
}

/**
 * Resolve a review item (generic resolution)
 */
export async function resolveReview(
  reviewId: string,
  resolvedBy: string,
  notes: string
): Promise<ReviewQueueRow | null> {
  return updateReviewStatus(reviewId, {
    status: 'resolved',
    resolved_by: resolvedBy,
    resolved_notes: notes,
  });
}

/**
 * Start review (mark as in_review)
 */
export async function startReview(
  reviewId: string,
  assignedTo: string
): Promise<ReviewQueueRow | null> {
  return updateReviewStatus(reviewId, {
    status: 'in_review',
    assigned_to: assignedTo,
  });
}

/**
 * Get review queue items
 */
export async function getReviewQueue(
  filters: {
    status?: ReviewStatus | ReviewStatus[];
    reviewType?: string;
    priority?: string;
    limit?: number;
  } = {}
): Promise<ReviewQueueRow[]> {
  let query = supabaseAdmin
    .from('review_queue')
    .select('*')
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true });

  if (filters.status) {
    if (Array.isArray(filters.status)) {
      query = query.in('status', filters.status);
    } else {
      query = query.eq('status', filters.status);
    }
  }

  if (filters.reviewType) {
    query = query.eq('review_type', filters.reviewType);
  }

  if (filters.priority) {
    query = query.eq('priority', filters.priority);
  }

  if (filters.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('Failed to get review queue', { error: error.message });
    return [];
  }

  return data as ReviewQueueRow[];
}

/**
 * Get review queue statistics
 */
export async function getReviewStats(): Promise<{
  total: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  byType: Record<string, number>;
}> {
  const { data, error } = await supabaseAdmin
    .from('review_queue')
    .select('status, priority, review_type')
    .in('status', ['open', 'in_review']);

  if (error) {
    return { total: 0, byStatus: {}, byPriority: {}, byType: {} };
  }

  const byStatus: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  const byType: Record<string, number> = {};

  for (const row of data || []) {
    byStatus[row.status] = (byStatus[row.status] || 0) + 1;
    byPriority[row.priority] = (byPriority[row.priority] || 0) + 1;
    byType[row.review_type] = (byType[row.review_type] || 0) + 1;
  }

  return {
    total: data?.length ?? 0,
    byStatus,
    byPriority,
    byType,
  };
}
