/**
 * Daily Cron Route
 * 
 * Runs daily jobs: price check, daily guard, retry sweep
 * Schedule: Every day at 6 AM
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/jobs/supabase';
import { enqueueJob, generateDedupeKey } from '@/lib/jobs/enqueue';
import { releaseStaleJobs } from '@/lib/jobs/claim';
import { logger } from '@/lib/jobs/logger';
import { isAgentEnabled } from '@/lib/agents/config';

// Verify internal request
function verifyInternalRequest(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return process.env.NODE_ENV === 'development';
  }
  
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${cronSecret}`;
}

// Acquire cron lock
async function acquireLock(lockKey: string, workerId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.rpc('acquire_cron_lock', {
    p_lock_key: lockKey,
    p_locked_by: workerId,
    p_duration_minutes: 60,
  });
  return data === true;
}

// Release cron lock
async function releaseLock(lockKey: string, workerId: string): Promise<void> {
  await supabaseAdmin.rpc('release_cron_lock', {
    p_lock_key: lockKey,
    p_locked_by: workerId,
  });
}

export async function POST(request: Request) {
  // Verify request is from internal cron
  if (!verifyInternalRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const lockKey = 'cron:daily';
  const workerId = `daily-${Date.now()}`;
  const startTime = Date.now();

  try {
    // Acquire lock
    const locked = await acquireLock(lockKey, workerId);
    if (!locked) {
      logger.info('Daily cron already running, skipping');
      return NextResponse.json({ message: 'Already running' });
    }

    logger.info('Daily cron started', { worker_id: workerId });

    const jobsCreated: string[] = [];
    const today = new Date().toISOString().split('T')[0];

    // 1. Release stale jobs
    const staleReleased = await releaseStaleJobs(60);
    if (staleReleased > 0) {
      logger.info('Released stale jobs', { count: staleReleased });
    }

    // 2. Enqueue daily price guard
    if (await isAgentEnabled('daily_price_guard')) {
      const result = await enqueueJob({
        job_type: 'daily_price_guard',
        payload: { run_date: today },
        dedupe_key: generateDedupeKey('daily_price_guard', undefined, undefined, today),
        priority: 40,
      });
      if (result.created) jobsCreated.push('daily_price_guard');
    }

    // 3. Enqueue competitor price checks for high-priority products
    if (await isAgentEnabled('competitive_pricing')) {
      // Get high-traffic product IDs
      const { data: products } = await supabaseAdmin
        .from('products')
        .select('id')
        .not('price', 'is', null)
        .limit(50); // Top 50 products

      if (products && products.length > 0) {
        const result = await enqueueJob({
          job_type: 'competitor_price_check',
          payload: {
            product_ids: products.map(p => p.id),
            priority_tier: 'high',
          },
          dedupe_key: generateDedupeKey('competitor_price_check', undefined, undefined, today),
          priority: 45,
        });
        if (result.created) jobsCreated.push('competitor_price_check');
      }
    }

    // 4. Process pending system events
    const result = await enqueueJob({
      job_type: 'system_event_processor',
      payload: { batch_size: 100 },
      dedupe_key: generateDedupeKey('system_event_processor', undefined, undefined, `${today}:daily`),
      priority: 50,
    });
    if (result.created) jobsCreated.push('system_event_processor');

    // Release lock
    await releaseLock(lockKey, workerId);

    const duration = Date.now() - startTime;
    logger.info('Daily cron completed', {
      worker_id: workerId,
      duration_ms: duration,
      jobs_created: jobsCreated,
    });

    return NextResponse.json({
      success: true,
      duration_ms: duration,
      stale_jobs_released: staleReleased,
      jobs_created: jobsCreated,
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Daily cron failed', { error: message });
    
    // Try to release lock
    await releaseLock(lockKey, workerId);

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
