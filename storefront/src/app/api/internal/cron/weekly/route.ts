/**
 * Weekly Cron Route
 * 
 * Runs weekly jobs: supplier discovery, long-tail pricing, catalog sweep
 * Schedule: Every Sunday at 3 AM
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/jobs/supabase';
import { enqueueJob, generateDedupeKey } from '@/lib/jobs/enqueue';
import { logger } from '@/lib/jobs/logger';
import { isAgentEnabled } from '@/lib/agents/config';

function verifyInternalRequest(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return process.env.NODE_ENV === 'development';
  return request.headers.get('authorization') === `Bearer ${cronSecret}`;
}

async function acquireLock(lockKey: string, workerId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.rpc('acquire_cron_lock', {
    p_lock_key: lockKey,
    p_locked_by: workerId,
    p_duration_minutes: 180,
  });
  return data === true;
}

async function releaseLock(lockKey: string, workerId: string): Promise<void> {
  await supabaseAdmin.rpc('release_cron_lock', {
    p_lock_key: lockKey,
    p_locked_by: workerId,
  });
}

export async function POST(request: Request) {
  if (!verifyInternalRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const lockKey = 'cron:weekly';
  const workerId = `weekly-${Date.now()}`;
  const startTime = Date.now();

  try {
    const locked = await acquireLock(lockKey, workerId);
    if (!locked) {
      logger.info('Weekly cron already running, skipping');
      return NextResponse.json({ message: 'Already running' });
    }

    logger.info('Weekly cron started', { worker_id: workerId });

    const jobsCreated: string[] = [];
    const weekNum = getISOWeek(new Date());
    const year = new Date().getFullYear();
    const weekKey = `${year}-W${weekNum}`;

    // 1. Supplier discovery
    if (await isAgentEnabled('supplier_discovery')) {
      const result = await enqueueJob({
        job_type: 'supplier_discovery',
        payload: {
          categories: ['nitrile', 'vinyl', 'latex', 'industrial'],
          max_results: 50,
        },
        dedupe_key: generateDedupeKey('supplier_discovery', undefined, undefined, weekKey),
        priority: 60,
      });
      if (result.created) jobsCreated.push('supplier_discovery');
    }

    // 2. Long-tail product pricing (include low-traffic products)
    if (await isAgentEnabled('daily_price_guard')) {
      const result = await enqueueJob({
        job_type: 'daily_price_guard',
        payload: {
          include_long_tail: true,
          run_date: new Date().toISOString().split('T')[0],
        },
        dedupe_key: generateDedupeKey('daily_price_guard', undefined, undefined, `${weekKey}:longtail`),
        priority: 70,
      });
      if (result.created) jobsCreated.push('daily_price_guard:longtail');
    }

    // 3. Competitor price check for all products
    if (await isAgentEnabled('competitive_pricing')) {
      const { data: products } = await supabaseAdmin
        .from('products')
        .select('id')
        .not('price', 'is', null);

      if (products && products.length > 0) {
        // Batch into chunks of 100
        const batchSize = 100;
        for (let i = 0; i < products.length; i += batchSize) {
          const batch = products.slice(i, i + batchSize);
          const batchNum = Math.floor(i / batchSize);
          
          await enqueueJob({
            job_type: 'competitor_price_check',
            payload: {
              product_ids: batch.map(p => p.id),
              priority_tier: i === 0 ? 'high' : 'low',
            },
            dedupe_key: generateDedupeKey('competitor_price_check', undefined, undefined, `${weekKey}:batch${batchNum}`),
            priority: 80 + batchNum,
            run_after: new Date(Date.now() + batchNum * 5 * 60 * 1000), // Stagger by 5 min
          });
        }
        jobsCreated.push(`competitor_price_check:${Math.ceil(products.length / batchSize)} batches`);
      }
    }

    // 4. Duplicate catalog detection (full sweep)
    // This would be a dedicated job type if implemented
    // For now, the audit run handles this

    await releaseLock(lockKey, workerId);

    const duration = Date.now() - startTime;
    logger.info('Weekly cron completed', {
      worker_id: workerId,
      duration_ms: duration,
      jobs_created: jobsCreated,
    });

    return NextResponse.json({
      success: true,
      duration_ms: duration,
      jobs_created: jobsCreated,
      week: weekKey,
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Weekly cron failed', { error: message });
    await releaseLock(lockKey, workerId);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export async function GET(request: Request) {
  return POST(request);
}
