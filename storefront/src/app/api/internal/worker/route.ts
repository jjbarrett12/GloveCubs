/**
 * Worker Route
 * 
 * Processes a single job from the queue.
 * Called repeatedly by external scheduler or invoked directly.
 */

import { NextResponse } from 'next/server';
import { claimNextJob, releaseStaleJobs } from '@/lib/jobs/claim';
import { dispatchJob, getSupportedJobTypes } from '@/lib/jobs/dispatcher';
import { logger, createWorkerLogger } from '@/lib/jobs/logger';
import type { JobType } from '@/lib/agents/types';

function verifyInternalRequest(request: Request): boolean {
  const workerSecret = process.env.WORKER_SECRET || process.env.CRON_SECRET;
  if (!workerSecret) return process.env.NODE_ENV === 'development';
  return request.headers.get('authorization') === `Bearer ${workerSecret}`;
}

export async function POST(request: Request) {
  if (!verifyInternalRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const workerId = `worker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const workerLog = createWorkerLogger(workerId);

  try {
    // Parse request body for options
    let jobTypes: JobType[] | undefined;
    let maxJobs = 1;

    try {
      const body = await request.json();
      if (body.job_types && Array.isArray(body.job_types)) {
        jobTypes = body.job_types;
      }
      if (body.max_jobs && typeof body.max_jobs === 'number') {
        maxJobs = Math.min(body.max_jobs, 10); // Cap at 10 per request
      }
    } catch {
      // No body or invalid JSON - use defaults
    }

    workerLog.info('Worker started', { max_jobs: maxJobs, job_types: jobTypes });

    // Release any stale jobs first
    await releaseStaleJobs(30);

    // Process jobs
    const results: Array<{
      job_id: string;
      job_type: string;
      success: boolean;
      duration_ms: number;
    }> = [];

    for (let i = 0; i < maxJobs; i++) {
      const jobStartTime = Date.now();
      
      // Claim next job
      const job = await claimNextJob(workerId, jobTypes);
      
      if (!job) {
        workerLog.debug('No jobs available');
        break;
      }

      workerLog.info('Processing job', {
        job_id: job.job_id,
        job_type: job.job_type,
        attempt: job.attempt_count,
      });

      // Dispatch to handler
      await dispatchJob(job);

      const jobDuration = Date.now() - jobStartTime;
      results.push({
        job_id: job.job_id,
        job_type: job.job_type,
        success: true,
        duration_ms: jobDuration,
      });
    }

    const duration = Date.now() - startTime;
    workerLog.info('Worker completed', {
      jobs_processed: results.length,
      duration_ms: duration,
    });

    return NextResponse.json({
      success: true,
      worker_id: workerId,
      jobs_processed: results.length,
      duration_ms: duration,
      results,
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    workerLog.error('Worker failed', { error: message });

    return NextResponse.json(
      { error: message, worker_id: workerId },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  // GET returns worker status/info
  if (!verifyInternalRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    supported_job_types: getSupportedJobTypes(),
    usage: {
      method: 'POST',
      body: {
        job_types: '(optional) array of job types to process',
        max_jobs: '(optional) max jobs to process (1-10)',
      },
    },
  });
}
