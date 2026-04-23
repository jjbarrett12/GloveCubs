/**
 * Nightly Cron Route
 * 
 * Runs nightly jobs: audit, cleanup, stale detection
 * Schedule: Every night at 2 AM
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/jobs/supabase';
import { enqueueJob, generateDedupeKey } from '@/lib/jobs/enqueue';
import { logger } from '@/lib/jobs/logger';
import { isAgentEnabled } from '@/lib/agents/config';
import { 
  collectPipelineMetrics, 
  recordAiMetrics,
  batchUpdateReviewPriorities,
  generateDailyOpsReport,
  generateLearningCandidates,
} from '@/lib/ai';
import { runProcurementIntelligenceCycle } from '@/lib/procurement';
import { runForecastingCycle } from '@/lib/forecasting';

function verifyInternalRequest(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return process.env.NODE_ENV === 'development';
  return request.headers.get('authorization') === `Bearer ${cronSecret}`;
}

async function acquireLock(lockKey: string, workerId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.rpc('acquire_cron_lock', {
    p_lock_key: lockKey,
    p_locked_by: workerId,
    p_duration_minutes: 120,
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

  const lockKey = 'cron:nightly';
  const workerId = `nightly-${Date.now()}`;
  const startTime = Date.now();

  try {
    const locked = await acquireLock(lockKey, workerId);
    if (!locked) {
      logger.info('Nightly cron already running, skipping');
      return NextResponse.json({ message: 'Already running' });
    }

    logger.info('Nightly cron started', { worker_id: workerId });

    const jobsCreated: string[] = [];
    const cleanupStats: Record<string, number> = {};
    const today = new Date().toISOString().split('T')[0];

    // 1. Enqueue audit run
    if (await isAgentEnabled('audit_supervisor')) {
      const result = await enqueueJob({
        job_type: 'audit_run',
        payload: { full_audit: true },
        dedupe_key: generateDedupeKey('audit_run', undefined, undefined, today),
        priority: 30,
      });
      if (result.created) jobsCreated.push('audit_run');
    }

    // 2. Clean up old completed jobs (keep 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const { data: deletedJobs } = await supabaseAdmin
      .from('job_queue')
      .delete()
      .in('status', ['completed', 'cancelled'])
      .lt('completed_at', thirtyDaysAgo.toISOString())
      .select('id');
    cleanupStats.old_jobs_deleted = deletedJobs?.length ?? 0;

    // 3. Clean up old job runs (keep 14 days)
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const { data: deletedRuns } = await supabaseAdmin
      .from('job_runs')
      .delete()
      .lt('created_at', fourteenDaysAgo.toISOString())
      .select('id');
    cleanupStats.old_runs_deleted = deletedRuns?.length ?? 0;

    // 4. Clean up old resolved reviews (keep 30 days)
    const { data: deletedReviews } = await supabaseAdmin
      .from('review_queue')
      .delete()
      .in('status', ['approved', 'rejected', 'resolved'])
      .lt('resolved_at', thirtyDaysAgo.toISOString())
      .select('id');
    cleanupStats.old_reviews_deleted = deletedReviews?.length ?? 0;

    // 5. Clean up old processed events (keep 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const { data: deletedEvents } = await supabaseAdmin
      .from('system_events')
      .delete()
      .in('status', ['processed', 'ignored'])
      .lt('processed_at', sevenDaysAgo.toISOString())
      .select('id');
    cleanupStats.old_events_deleted = deletedEvents?.length ?? 0;

    // 6. Detect stale data warnings
    const stalePricing = await detectStalePricing();
    if (stalePricing > 0) {
      cleanupStats.stale_pricing_warnings = stalePricing;
    }

    // 7. Compute daily pipeline metrics
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];
    const metricsComputed = await computeDailyMetrics(yesterday);
    cleanupStats.metrics_computed = metricsComputed ? 1 : 0;

    // 8. Collect and record AI performance metrics
    try {
      const runId = `nightly_${today}`;
      const aiMetrics = await collectPipelineMetrics(runId);
      if (aiMetrics.length > 0) {
        await recordAiMetrics(aiMetrics, runId);
        cleanupStats.ai_metrics_recorded = aiMetrics.length;
      }
    } catch (error) {
      logger.warn('AI metrics collection failed', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }

    // 9. Update review queue priorities
    try {
      const priorityResult = await batchUpdateReviewPriorities();
      cleanupStats.review_priorities_updated = priorityResult.updated;
    } catch (error) {
      logger.warn('Review priority update failed', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }

    // 10. Generate daily ops intelligence report
    try {
      const dailyReport = await generateDailyOpsReport();
      cleanupStats.daily_report_generated = 1;
      cleanupStats.ai_recommendations = dailyReport.recommendations.length;
    } catch (error) {
      logger.warn('Daily ops report generation failed', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }

    // 11. Generate learning candidates from operator feedback
    try {
      const learningCandidates = await generateLearningCandidates(
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
        2 // Minimum 2 occurrences
      );
      cleanupStats.learning_candidates_found = learningCandidates.length;
      
      if (learningCandidates.length > 0) {
        logger.info('Learning candidates generated', {
          count: learningCandidates.length,
          types: learningCandidates.map(c => c.type),
        });
      }
    } catch (error) {
      logger.warn('Learning candidate generation failed', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }

    // 12. Run procurement intelligence cycle (includes outcome tracking and feedback)
    try {
      const procurementResult = await runProcurementIntelligenceCycle();
      cleanupStats.suppliers_scored = procurementResult.suppliers_scored;
      cleanupStats.margin_opportunities_found = procurementResult.opportunities_found;
      cleanupStats.procurement_alerts_generated = procurementResult.alerts_generated;
      cleanupStats.procurement_metrics_collected = procurementResult.metrics_collected;
      cleanupStats.recommendations_expired = procurementResult.recommendations_expired;
      cleanupStats.quality_metrics_calculated = procurementResult.quality_metrics_calculated;
      cleanupStats.feedback_patterns_detected = procurementResult.feedback_patterns_detected;
      cleanupStats.scoring_adjustments_created = procurementResult.adjustments_created;
      
      logger.info('Procurement intelligence cycle completed', procurementResult);
    } catch (error) {
      logger.warn('Procurement intelligence cycle failed', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }

    // 13. Run forecasting and commercial guidance cycle
    try {
      const forecastingResult = await runForecastingCycle();
      cleanupStats.supplier_forecasts_generated = forecastingResult.supplier_forecasts_generated;
      cleanupStats.volatility_forecasts_generated = forecastingResult.volatility_forecasts_generated;
      cleanupStats.commercial_guidance_generated = forecastingResult.guidance_generated;
      cleanupStats.risk_scores_calculated = forecastingResult.risk_scores_calculated;
      cleanupStats.forecast_metrics_calculated = forecastingResult.metrics_calculated;
      cleanupStats.old_forecasts_cleaned = forecastingResult.forecasts_cleaned;
      
      logger.info('Forecasting cycle completed', forecastingResult);
    } catch (error) {
      logger.warn('Forecasting cycle failed', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }

    await releaseLock(lockKey, workerId);

    const duration = Date.now() - startTime;
    logger.info('Nightly cron completed', {
      worker_id: workerId,
      duration_ms: duration,
      jobs_created: jobsCreated,
      cleanup_stats: cleanupStats,
    });

    return NextResponse.json({
      success: true,
      duration_ms: duration,
      jobs_created: jobsCreated,
      cleanup_stats: cleanupStats,
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Nightly cron failed', { error: message });
    await releaseLock(lockKey, workerId);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function detectStalePricing(): Promise<number> {
  // Find products with no price update in 14+ days
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  
  const { data: staleProducts } = await supabaseAdmin
    .from('supplier_offers')
    .select('product_id')
    .eq('is_active', true)
    .lt('updated_at', fourteenDaysAgo.toISOString())
    .limit(100);

  return staleProducts?.length ?? 0;
}

async function computeDailyMetrics(runDate: string): Promise<boolean> {
  try {
    // Call the stored procedure to compute metrics
    await supabaseAdmin.rpc('compute_daily_metrics', { p_date: runDate });
    logger.info('Daily metrics computed', { run_date: runDate });
    return true;
  } catch {
    // If stored procedure doesn't exist, compute manually
    const { data: jobRuns } = await supabaseAdmin
      .from('job_runs')
      .select('job_type, status, duration_ms, error_message, output_payload')
      .gte('started_at', `${runDate}T00:00:00Z`)
      .lt('started_at', `${runDate}T23:59:59Z`);

    if (!jobRuns || jobRuns.length === 0) {
      return false;
    }

    // Aggregate by job type using object instead of Map to avoid iterator issues
    const byJobType: Record<string, {
      completed: number;
      failed: number;
      blocked: number;
      totalDuration: number;
      maxDuration: number;
      errors: number;
    }> = {};

    for (const run of jobRuns) {
      if (!byJobType[run.job_type]) {
        byJobType[run.job_type] = {
          completed: 0,
          failed: 0,
          blocked: 0,
          totalDuration: 0,
          maxDuration: 0,
          errors: 0,
        };
      }

      const existing = byJobType[run.job_type];
      if (run.status === 'completed') existing.completed++;
      if (run.status === 'failed') existing.failed++;
      if (run.status === 'blocked') existing.blocked++;
      if (run.duration_ms) {
        existing.totalDuration += run.duration_ms;
        existing.maxDuration = Math.max(existing.maxDuration, run.duration_ms);
      }
      if (run.error_message) existing.errors++;
    }

    // Upsert metrics
    const jobTypes = Object.keys(byJobType);
    for (const jobType of jobTypes) {
      const stats = byJobType[jobType];
      const totalRuns = stats.completed + stats.failed + stats.blocked;
      await supabaseAdmin
        .from('pipeline_metrics')
        .upsert({
          run_date: runDate,
          metric_type: 'job_type_summary',
          metric_key: jobType,
          jobs_completed: stats.completed,
          jobs_failed: stats.failed,
          jobs_blocked: stats.blocked,
          total_duration_ms: stats.totalDuration,
          avg_duration_ms: totalRuns > 0 ? Math.floor(stats.totalDuration / totalRuns) : 0,
          max_duration_ms: stats.maxDuration,
          error_count: stats.errors,
          computed_at: new Date().toISOString(),
        }, { onConflict: 'run_date,metric_type,metric_key' });
    }

    // Compute overall daily summary
    let totalCompleted = 0;
    let totalFailed = 0;
    let totalBlocked = 0;
    let totalDuration = 0;
    let maxDuration = 0;
    let totalErrors = 0;

    for (const jobType of jobTypes) {
      const stats = byJobType[jobType];
      totalCompleted += stats.completed;
      totalFailed += stats.failed;
      totalBlocked += stats.blocked;
      totalDuration += stats.totalDuration;
      maxDuration = Math.max(maxDuration, stats.maxDuration);
      totalErrors += stats.errors;
    }

    const totalRuns = totalCompleted + totalFailed + totalBlocked;
    await supabaseAdmin
      .from('pipeline_metrics')
      .upsert({
        run_date: runDate,
        metric_type: 'daily_summary',
        metric_key: 'all',
        jobs_completed: totalCompleted,
        jobs_failed: totalFailed,
        jobs_blocked: totalBlocked,
        total_duration_ms: totalDuration,
        avg_duration_ms: totalRuns > 0 ? Math.floor(totalDuration / totalRuns) : 0,
        max_duration_ms: maxDuration,
        error_count: totalErrors,
        computed_at: new Date().toISOString(),
      }, { onConflict: 'run_date,metric_type,metric_key' });
      
    return true;
  }
}

export async function GET(request: Request) {
  return POST(request);
}
