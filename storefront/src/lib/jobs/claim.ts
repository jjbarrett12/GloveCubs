/**
 * Job Queue - Claim Service
 * 
 * Atomically claims the next available job for processing.
 */

import { supabaseAdmin } from './supabase';
import { logger } from './logger';
import type { ClaimedJob, JobType } from '../agents/types';

const LOCK_TIMEOUT_MINUTES = 30;

/**
 * Claim the next available job atomically
 * Uses the Postgres function for atomic claiming
 */
export async function claimNextJob(
  workerName: string,
  allowedJobTypes?: JobType[]
): Promise<ClaimedJob | null> {
  const { data, error } = await supabaseAdmin.rpc('claim_next_job', {
    p_worker_name: workerName,
    p_job_types: allowedJobTypes ?? null,
    p_lock_timeout_minutes: LOCK_TIMEOUT_MINUTES,
  });

  if (error) {
    logger.error('Failed to claim job', { error: error.message, workerName });
    throw new Error(`Failed to claim job: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return null;
  }

  const job = data[0];

  // Create started job_run entry
  await supabaseAdmin.from('job_runs').insert({
    job_id: job.job_id,
    job_type: job.job_type,
    worker_name: workerName,
    status: 'started',
    input_payload: job.payload,
  });

  logger.info('Job claimed', {
    job_id: job.job_id,
    job_type: job.job_type,
    worker: workerName,
    attempt: job.attempt_count,
  });

  return {
    job_id: job.job_id,
    job_type: job.job_type as JobType,
    payload: job.payload,
    attempt_count: job.attempt_count,
  };
}

/**
 * Check if there are pending jobs of specific types
 */
export async function hasPendingJobs(jobTypes?: JobType[]): Promise<boolean> {
  let query = supabaseAdmin
    .from('job_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  if (jobTypes && jobTypes.length > 0) {
    query = query.in('job_type', jobTypes);
  }

  const { count } = await query;
  return (count ?? 0) > 0;
}

/**
 * Get count of pending jobs by type
 */
export async function getPendingJobCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabaseAdmin
    .from('job_queue')
    .select('job_type')
    .eq('status', 'pending');

  if (error) {
    logger.error('Failed to get pending job counts', { error: error.message });
    return {};
  }

  const counts: Record<string, number> = {};
  for (const row of data || []) {
    counts[row.job_type] = (counts[row.job_type] || 0) + 1;
  }

  return counts;
}

/**
 * Release stale locks (jobs that were locked but never completed)
 */
export async function releaseStaleJobs(
  olderThanMinutes: number = LOCK_TIMEOUT_MINUTES
): Promise<number> {
  const staleTime = new Date(Date.now() - olderThanMinutes * 60 * 1000);

  const { data, error } = await supabaseAdmin
    .from('job_queue')
    .update({
      status: 'pending',
      locked_at: null,
      locked_by: null,
    })
    .eq('status', 'running')
    .lt('locked_at', staleTime.toISOString())
    .select('id');

  if (error) {
    logger.error('Failed to release stale jobs', { error: error.message });
    return 0;
  }

  const count = data?.length ?? 0;
  if (count > 0) {
    logger.warn('Released stale jobs', { count, older_than_minutes: olderThanMinutes });
  }

  return count;
}
