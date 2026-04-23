/**
 * Job Queue - Main Exports
 */

// Core operations
export { enqueueJob, enqueueJobs, scheduleJob, generateDedupeKey, enqueueFollowupJobs } from './enqueue';
export { claimNextJob, hasPendingJobs, getPendingJobCounts, releaseStaleJobs } from './claim';
export { completeJob, completeJobSimple } from './complete';
export { failJob, getFailedJobs, retryJob } from './fail';
export { blockJob, getBlockedJobs, unblockJob } from './block';

// Dispatcher
export { dispatchJob, hasHandler, getSupportedJobTypes, registerHandler } from './dispatcher';

// Logging
export { logger, createJobLogger, createWorkerLogger } from './logger';

// Validation
export { validateJobPayload, sanitizePayload, isValidUUID } from './validate';

// Types (re-export commonly used)
export type {
  JobType,
  JobStatus,
  JobPayload,
  JobExecutionResult,
  EnqueueJobInput,
  ClaimedJob,
} from '../agents/types';
