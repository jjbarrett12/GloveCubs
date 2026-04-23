/**
 * Admin Job Retry API
 * 
 * Retries a failed job
 */

import { NextResponse } from 'next/server';
import { retryJob, getFailedJobs } from '@/lib/jobs/fail';
import { supabaseAdmin } from '@/lib/jobs/supabase';
import { logger } from '@/lib/jobs/logger';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return NextResponse.json(
      { error: 'Invalid job ID format' },
      { status: 400 }
    );
  }

  // Check job exists and is failed
  const { data: job, error: fetchError } = await supabaseAdmin
    .from('job_queue')
    .select('id, status, job_type')
    .eq('id', id)
    .single();

  if (fetchError || !job) {
    return NextResponse.json(
      { error: 'Job not found' },
      { status: 404 }
    );
  }

  if (job.status !== 'failed' && job.status !== 'blocked') {
    return NextResponse.json(
      { error: `Cannot retry job in ${job.status} status` },
      { status: 400 }
    );
  }

  const success = await retryJob(id);

  if (!success) {
    return NextResponse.json(
      { error: 'Failed to retry job' },
      { status: 500 }
    );
  }

  logger.info('Job manually retried via admin', { job_id: id });

  // Redirect back for form submissions
  const referer = request.headers.get('referer');
  if (referer && request.headers.get('content-type')?.includes('form')) {
    return NextResponse.redirect(referer);
  }

  return NextResponse.json({
    success: true,
    id,
    new_status: 'pending',
  });
}
