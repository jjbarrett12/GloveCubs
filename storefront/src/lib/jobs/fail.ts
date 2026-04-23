/**
 * Job Queue - Fail Service
 * 
 * Handles job failures with retry logic.
 */

import { supabaseAdmin } from './supabase';
import { logger } from './logger';

const RETRY_BACKOFF_MINUTES = [1, 5, 15, 30, 60];

/**
 * Mark a job as failed with optional retry
 */
export async function failJob(
  jobId: string,
  error: string | Error,
  forceNoRetry: boolean = false
): Promise<{ retrying: boolean; exhausted: boolean }> {
  const errorMessage = error instanceof Error ? error.message : error;
  const now = new Date();

  // Get current job state
  const { data: job, error: fetchError } = await supabaseAdmin
    .from('job_queue')
    .select('attempt_count, max_attempts')
    .eq('id', jobId)
    .single();

  if (fetchError || !job) {
    logger.error('Failed to fetch job for failure', { job_id: jobId });
    throw new Error(`Job not found: ${jobId}`);
  }

  const attemptsRemaining = job.max_attempts - job.attempt_count;
  const shouldRetry = !forceNoRetry && attemptsRemaining > 0;

  // Find the started job_run and update it
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
        status: 'failed',
        error_message: errorMessage,
        ended_at: now.toISOString(),
        duration_ms: durationMs,
      })
      .eq('id', run.id);
  }

  if (shouldRetry) {
    // Calculate backoff
    const backoffIndex = Math.min(job.attempt_count, RETRY_BACKOFF_MINUTES.length - 1);
    const backoffMinutes = RETRY_BACKOFF_MINUTES[backoffIndex];
    const runAfter = new Date(now.getTime() + backoffMinutes * 60 * 1000);

    // Return to pending with backoff
    await supabaseAdmin
      .from('job_queue')
      .update({
        status: 'pending',
        locked_at: null,
        locked_by: null,
        last_error: errorMessage,
        run_after: runAfter.toISOString(),
      })
      .eq('id', jobId);

    logger.warn('Job failed, will retry', {
      job_id: jobId,
      attempt: job.attempt_count,
      max_attempts: job.max_attempts,
      retry_in_minutes: backoffMinutes,
      error: errorMessage,
    });

    return { retrying: true, exhausted: false };
  } else {
    // Mark as permanently failed
    await supabaseAdmin
      .from('job_queue')
      .update({
        status: 'failed',
        locked_at: null,
        locked_by: null,
        last_error: errorMessage,
        completed_at: now.toISOString(),
      })
      .eq('id', jobId);

    logger.error('Job failed permanently', {
      job_id: jobId,
      attempt: job.attempt_count,
      max_attempts: job.max_attempts,
      error: errorMessage,
    });

    return { retrying: false, exhausted: true };
  }
}

/**
 * Get failed jobs for potential manual retry
 */
export async function getFailedJobs(
  limit: number = 50
): Promise<Array<{ id: string; job_type: string; last_error: string; attempt_count: number }>> {
  const { data, error } = await supabaseAdmin
    .from('job_queue')
    .select('id, job_type, last_error, attempt_count, created_at')
    .eq('status', 'failed')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('Failed to get failed jobs', { error: error.message });
    return [];
  }

  return data || [];
}

/**
 * Manually retry a failed job
 */
export async function retryJob(jobId: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('job_queue')
    .update({
      status: 'pending',
      attempt_count: 0,
      last_error: null,
      run_after: null,
      locked_at: null,
      locked_by: null,
      completed_at: null,
    })
    .eq('id', jobId)
    .eq('status', 'failed');

  if (error) {
    logger.error('Failed to retry job', { job_id: jobId, error: error.message });
    return false;
  }

  logger.info('Job manually retried', { job_id: jobId });
  return true;
}
