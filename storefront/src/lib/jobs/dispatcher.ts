/**
 * Job Queue - Dispatcher
 * 
 * Routes jobs to the correct handler based on job type.
 */

import { logger, createJobLogger } from './logger';
import { completeJob } from './complete';
import { failJob } from './fail';
import { blockJob } from './block';
import { validateJobPayload } from './validate';
import type { ClaimedJob, JobType, JobExecutionResult } from '../agents/types';

// Import handlers
import { handleSupplierDiscovery } from './handlers/supplierDiscovery';
import { handleSupplierIngestion } from './handlers/supplierIngestion';
import { handleProductNormalization } from './handlers/productNormalization';
import { handleProductMatch } from './handlers/productMatch';
import { handleCompetitorPriceCheck } from './handlers/competitorPriceCheck';
import { handlePricingRecommendation } from './handlers/pricingRecommendation';
import { handleDailyPriceGuard } from './handlers/dailyPriceGuard';
import { handleAuditRun } from './handlers/auditRun';
import { handleSystemEventProcessor } from './handlers/systemEventProcessor';

type JobHandler = (payload: Record<string, unknown>) => Promise<JobExecutionResult>;

const HANDLERS: Record<JobType, JobHandler> = {
  supplier_discovery: handleSupplierDiscovery,
  supplier_ingestion: handleSupplierIngestion,
  product_normalization: handleProductNormalization,
  product_match: handleProductMatch,
  competitor_price_check: handleCompetitorPriceCheck,
  pricing_recommendation: handlePricingRecommendation,
  daily_price_guard: handleDailyPriceGuard,
  audit_run: handleAuditRun,
  review_queue_builder: handleSystemEventProcessor, // Alias
  system_event_processor: handleSystemEventProcessor,
};

/**
 * Dispatch a claimed job to its handler
 */
export async function dispatchJob(job: ClaimedJob): Promise<void> {
  const jobLogger = createJobLogger(job.job_id, job.job_type);
  const startTime = Date.now();

  jobLogger.info('Dispatching job', { attempt: job.attempt_count });

  const handler = HANDLERS[job.job_type];

  if (!handler) {
    jobLogger.error('No handler found for job type');
    await failJob(job.job_id, `No handler for job type: ${job.job_type}`, true);
    return;
  }

  // Validate payload before processing
  const validation = validateJobPayload(job.job_type, job.payload);
  if (!validation.valid) {
    jobLogger.warn('Invalid payload, blocking job', { errors: validation.errors });
    await blockJob(job.job_id, `Invalid payload: ${validation.errors.join(', ')}`);
    return;
  }

  try {
    const result = await handler(job.payload);

    const durationMs = Date.now() - startTime;

    if (result.blocked) {
      await blockJob(job.job_id, result.blockReason ?? 'Handler blocked execution');
      jobLogger.warn('Job blocked by handler', {
        duration_ms: durationMs,
        reason: result.blockReason,
      });
    } else if (result.success) {
      await completeJob(job.job_id, result);
      jobLogger.info('Job completed successfully', {
        duration_ms: durationMs,
        review_items: result.reviewItems?.length ?? 0,
        followup_jobs: result.followupJobs?.length ?? 0,
      });
    } else {
      await failJob(job.job_id, result.error ?? 'Handler returned failure');
      jobLogger.warn('Job failed', {
        duration_ms: durationMs,
        error: result.error,
      });
    }
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    jobLogger.error('Job threw exception', {
      duration_ms: durationMs,
      error: errorMessage,
    });

    await failJob(job.job_id, errorMessage);
  }
}

/**
 * Check if a job type has a registered handler
 */
export function hasHandler(jobType: string): boolean {
  return jobType in HANDLERS;
}

/**
 * Get list of supported job types
 */
export function getSupportedJobTypes(): JobType[] {
  return Object.keys(HANDLERS) as JobType[];
}

/**
 * Register a custom handler (for testing or extensions)
 */
export function registerHandler(jobType: JobType, handler: JobHandler): void {
  HANDLERS[jobType] = handler;
  logger.info('Handler registered', { job_type: jobType });
}
