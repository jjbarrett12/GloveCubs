/**
 * Job Queue - Enqueue Service
 * 
 * Handles creating new jobs with deduplication support.
 */

import { supabaseAdmin } from './supabase';
import { logger } from './logger';
import type { EnqueueJobInput, JobQueueRow, JobType } from '../agents/types';

export interface EnqueueResult {
  job: JobQueueRow;
  created: boolean;
  dedupe_matched: boolean;
}

/**
 * Enqueue a new job with optional deduplication
 * Uses atomic database function to prevent race conditions
 */
export async function enqueueJob(input: EnqueueJobInput): Promise<EnqueueResult> {
  const {
    job_type,
    payload,
    priority = 50,
    source_table,
    source_id,
    dedupe_key,
    run_after,
    created_by,
  } = input;

  // Use atomic function for deduplication safety
  const { data, error } = await supabaseAdmin.rpc('enqueue_job_atomic', {
    p_job_type: job_type,
    p_payload: payload,
    p_priority: priority,
    p_source_table: source_table ?? null,
    p_source_id: source_id ?? null,
    p_dedupe_key: dedupe_key ?? null,
    p_run_after: run_after?.toISOString() ?? null,
    p_created_by: created_by ?? null,
  });

  if (error) {
    logger.error('Failed to enqueue job', { error: error.message, job_type });
    throw new Error(`Failed to enqueue job: ${error.message}`);
  }

  const result = data?.[0];
  if (!result) {
    throw new Error('No result from enqueue_job_atomic');
  }

  // Fetch full job record
  const { data: job, error: fetchError } = await supabaseAdmin
    .from('job_queue')
    .select('*')
    .eq('id', result.job_id)
    .single();

  if (fetchError || !job) {
    throw new Error(`Failed to fetch job: ${fetchError?.message}`);
  }

  if (result.dedupe_matched) {
    logger.info('Job deduplicated', {
      job_type,
      dedupe_key,
      existing_job_id: result.job_id,
    });
  } else {
    logger.info('Job enqueued', {
      job_id: result.job_id,
      job_type,
      priority,
      dedupe_key,
    });
  }

  return {
    job: job as JobQueueRow,
    created: result.created,
    dedupe_matched: result.dedupe_matched,
  };
}

/**
 * Enqueue multiple jobs in a batch
 */
export async function enqueueJobs(inputs: EnqueueJobInput[]): Promise<EnqueueResult[]> {
  const results: EnqueueResult[] = [];

  for (const input of inputs) {
    const result = await enqueueJob(input);
    results.push(result);
  }

  return results;
}

/**
 * Generate a standard dedupe key
 */
export function generateDedupeKey(
  job_type: JobType,
  source_table?: string,
  source_id?: string,
  extra?: string
): string {
  const parts: string[] = [job_type];
  if (source_table) parts.push(source_table);
  if (source_id) parts.push(source_id);
  if (extra) parts.push(extra);
  return parts.join(':');
}

/**
 * Schedule a job for future execution
 */
export async function scheduleJob(
  input: EnqueueJobInput,
  runAt: Date
): Promise<EnqueueResult> {
  return enqueueJob({
    ...input,
    run_after: runAt,
  });
}

/**
 * Enqueue jobs with dependencies (chain)
 */
export async function enqueueFollowupJobs(
  jobs: EnqueueJobInput[],
  sourceJobId: string
): Promise<EnqueueResult[]> {
  const results: EnqueueResult[] = [];

  for (const job of jobs) {
    const result = await enqueueJob({
      ...job,
      payload: {
        ...job.payload,
        _triggered_by: sourceJobId,
      },
    });
    results.push(result);
  }

  logger.info('Followup jobs enqueued', {
    source_job_id: sourceJobId,
    count: results.length,
    types: jobs.map(j => j.job_type),
  });

  return results;
}
