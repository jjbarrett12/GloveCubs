/**
 * Job Queue - Block Service
 * 
 * Handles blocking jobs that cannot proceed safely.
 */

import { supabaseAdmin } from './supabase';
import { logger } from './logger';
import { createReviewItem } from '../review/createReviewItem';
import type { ReviewType, ReviewPriority, ReviewQueueCreateInput } from '../agents/types';

export interface BlockJobOptions {
  createReviewItem?: boolean;
  reviewType?: ReviewType;
  reviewPriority?: ReviewPriority;
  reviewTitle?: string;
  reviewDetails?: Record<string, unknown>;
}

/**
 * Block a job from proceeding
 */
export async function blockJob(
  jobId: string,
  reason: string,
  options: BlockJobOptions = {}
): Promise<void> {
  const now = new Date();

  // Get job info
  const { data: job } = await supabaseAdmin
    .from('job_queue')
    .select('job_type, payload, source_table, source_id')
    .eq('id', jobId)
    .single();

  // Update job status
  const { error: updateError } = await supabaseAdmin
    .from('job_queue')
    .update({
      status: 'blocked',
      blocked_reason: reason,
      locked_at: null,
      locked_by: null,
      completed_at: now.toISOString(),
    })
    .eq('id', jobId);

  if (updateError) {
    logger.error('Failed to block job', { job_id: jobId, error: updateError.message });
    throw new Error(`Failed to block job: ${updateError.message}`);
  }

  // Update job_run if exists
  const { data: runs } = await supabaseAdmin
    .from('job_runs')
    .select('id, started_at')
    .eq('job_id', jobId)
    .eq('status', 'started')
    .order('started_at', { ascending: false })
    .limit(1);

  if (runs && runs.length > 0) {
    const run = runs[0];
    const durationMs = now.getTime() - new Date(run.started_at).getTime();

    await supabaseAdmin
      .from('job_runs')
      .update({
        status: 'blocked',
        error_message: reason,
        ended_at: now.toISOString(),
        duration_ms: durationMs,
      })
      .eq('id', run.id);
  }

  logger.warn('Job blocked', {
    job_id: jobId,
    job_type: job?.job_type,
    reason,
  });

  // Create review item if requested
  if (options.createReviewItem !== false && job) {
    const reviewInput: ReviewQueueCreateInput = {
      review_type: options.reviewType ?? mapJobTypeToReviewType(job.job_type),
      priority: options.reviewPriority ?? 'high',
      source_table: job.source_table,
      source_id: job.source_id,
      title: options.reviewTitle ?? `Blocked Job: ${job.job_type}`,
      issue_category: 'blocked_job',
      issue_summary: reason,
      recommended_action: 'Review blocked job and resolve underlying issue',
      agent_name: job.job_type,
      details: {
        job_id: jobId,
        job_type: job.job_type,
        payload: job.payload,
        blocked_reason: reason,
        ...options.reviewDetails,
      },
    };

    await createReviewItem(reviewInput);
  }
}

/**
 * Map job types to appropriate review types
 */
function mapJobTypeToReviewType(jobType: string): ReviewType {
  const mapping: Record<string, ReviewType> = {
    supplier_discovery: 'supplier',
    supplier_ingestion: 'supplier',
    product_normalization: 'catalog',
    product_match: 'product_match',
    competitor_price_check: 'pricing',
    pricing_recommendation: 'pricing',
    daily_price_guard: 'pricing',
    audit_run: 'audit',
    system_event_processor: 'system',
  };
  return mapping[jobType] ?? 'system';
}

/**
 * Get blocked jobs
 */
export async function getBlockedJobs(
  limit: number = 50
): Promise<Array<{ id: string; job_type: string; blocked_reason: string; created_at: string }>> {
  const { data, error } = await supabaseAdmin
    .from('job_queue')
    .select('id, job_type, blocked_reason, created_at')
    .eq('status', 'blocked')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('Failed to get blocked jobs', { error: error.message });
    return [];
  }

  return data || [];
}

/**
 * Unblock a job and return to pending
 */
export async function unblockJob(
  jobId: string,
  resetAttempts: boolean = true
): Promise<boolean> {
  const updates: Record<string, unknown> = {
    status: 'pending',
    blocked_reason: null,
    locked_at: null,
    locked_by: null,
    completed_at: null,
  };

  if (resetAttempts) {
    updates.attempt_count = 0;
  }

  const { error } = await supabaseAdmin
    .from('job_queue')
    .update(updates)
    .eq('id', jobId)
    .eq('status', 'blocked');

  if (error) {
    logger.error('Failed to unblock job', { job_id: jobId, error: error.message });
    return false;
  }

  logger.info('Job unblocked', { job_id: jobId });
  return true;
}
