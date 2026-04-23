/**
 * QA Supervisor - Public API
 * 
 * IMPORTANT LIMITATIONS:
 * - This service DETECTS issues and LOGS fixes to fix_logs table
 * - It does NOT actually write corrections to source tables
 * - To actually apply fixes, implement table-specific update logic
 */

// Main service
export { runQAAudit, runTargetedAudit } from './service';

// Trigger integrations
export {
  qaAfterNormalization,
  qaAfterMatching,
  qaAfterPricing,
  scheduleNightlyAudit,
  scheduleTargetedAudit,
  hasBlockedActions,
  getBlockedReasons,
} from './triggers';

// Configuration
export { loadQAConfig, getQAConfigValue, clearConfigCache } from './config';

// Persistence
export { 
  persistAuditResult,
  resolveBlockedAction,
  getActiveBlockedActions,
  getRecentFixLogs,
} from './persist';

// Data Loading
export {
  loadAuditData,
  loadOpsHealthData,
  type AuditDataSet,
} from './loader';

// Validation
export {
  validateAuditInput,
  generateFixDedupeKey,
  generateReviewDedupeKey,
  generateBlockedDedupeKey,
  type ValidationResult,
} from './validate';

// Types
export type {
  QAExecutionMode,
  QAAuditScope,
  QAAuditModule,
  QAAuditInput,
  QAAuditResult,
  QAAuditSummary,
  QAModuleResult,
  QAFix,
  QAReviewItem,
  QABlockedAction,
  QASystemicIssue,
  QASelfAudit,
  QAConfig,
  SupplierRecord,
  ProductRecord,
  MatchRecord,
  PricingRecord,
  ActionRecord,
} from './types';
