/**
 * Job Queue - Complete Service
 * 
 * Marks jobs as completed and records the result.
 */

import { supabaseAdmin } from './supabase';
import { logger } from './logger';
import type { JobExecutionResult, ReviewQueueCreateInput, EnqueueJobInput } from '../agents/types';
import { createReviewItem } from '../review/createReviewItem';
import { enqueueFollowupJobs } from './enqueue';

/**
 * Mark a job as successfully completed
 */
export async function completeJob(
  jobId: string,
  result: JobExecutionResult
): Promise<void> {
  const now = new Date();

  // Update job status
  const { error: updateError } = await supabaseAdmin
    .from('job_queue')
    .update({
      status: 'completed',
      completed_at: now.toISOString(),
      locked_at: null,
      locked_by: null,
    })
    .eq('id', jobId);

  if (updateError) {
    logger.error('Failed to complete job', { job_id: jobId, error: updateError.message });
    throw new Error(`Failed to complete job: ${updateError.message}`);
  }

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
        status: 'completed',
        output_payload: result.output ?? {},
        ended_at: now.toISOString(),
        duration_ms: durationMs,
      })
      .eq('id', run.id);
  }

  // Create review items if any
  if (result.reviewItems && result.reviewItems.length > 0) {
    for (const item of result.reviewItems) {
      await createReviewItem({
        ...item,
        details: {
          ...item.details,
          _source_job_id: jobId,
        },
      });
    }
    logger.info('Created review items from job', {
      job_id: jobId,
      count: result.reviewItems.length,
    });
  }

  // Enqueue followup jobs if any
  if (result.followupJobs && result.followupJobs.length > 0) {
    await enqueueFollowupJobs(result.followupJobs, jobId);
  }

  logger.info('Job completed', {
    job_id: jobId,
    review_items: result.reviewItems?.length ?? 0,
    followup_jobs: result.followupJobs?.length ?? 0,
  });
}

/**
 * Complete job with output data only (simplified)
 */
export async function completeJobSimple(
  jobId: string,
  output: Record<string, unknown> = {}
): Promise<void> {
  await completeJob(jobId, { success: true, output });
}
