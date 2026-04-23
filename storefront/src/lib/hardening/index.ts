/**
 * Production Hardening Module
 * 
 * Provides transaction handling, rate limiting, and error telemetry.
 */

// Transactions & Locking
export {
  withTransaction,
  acquireAdvisoryLock,
  withAdvisoryLock,
} from './transactions';

// Rate Limiting
export {
  checkRateLimit,
  recordFailedLogin,
  clearRateLimit,
  createRateLimitMiddleware,
  cleanupRateLimitData,
  RATE_LIMIT_CONFIGS,
  type RateLimitConfig,
  type RateLimitResult,
} from './rateLimiter';

// Error Telemetry
export {
  logErrorEvent,
  logSearchFailure,
  logApiFailure,
  logPublishFailure,
  logIngestionFailure,
  logAIExtractionFailure,
  logRecommendationEngineError,
  logPaymentFailure,
  logAuthenticationFailure,
  logTransactionFailure,
  getErrorStats,
  getRecentErrors,
  getUnacknowledgedAlerts,
  acknowledgeAlert,
  type ErrorCategory,
  type ErrorSeverity,
  type ErrorEvent,
  type TelemetryStats,
} from './telemetry';
