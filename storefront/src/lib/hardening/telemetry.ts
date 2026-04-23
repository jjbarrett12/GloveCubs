/**
 * Error Telemetry
 * 
 * Production error tracking for critical system failures.
 */

import { supabaseAdmin } from '../jobs/supabase';

// ============================================================================
// TYPES
// ============================================================================

export type ErrorCategory = 
  | 'ingestion_failure'
  | 'ai_extraction_failure'
  | 'recommendation_engine_error'
  | 'payment_failure'
  | 'authentication_failure'
  | 'transaction_failure'
  | 'validation_failure'
  | 'integration_failure'
  | 'search_failure'
  | 'api_failure'
  | 'publish_failure';

export type ErrorSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface ErrorEvent {
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  error_code?: string;
  stack_trace?: string;
  context?: Record<string, unknown>;
  entity_type?: string;
  entity_id?: string;
  user_id?: string;
  supplier_id?: string;
  buyer_id?: string;
  ip_address?: string;
  user_agent?: string;
}

export interface TelemetryStats {
  total_errors: number;
  by_category: Record<ErrorCategory, number>;
  by_severity: Record<ErrorSeverity, number>;
  error_rate_per_hour: number;
}

// ============================================================================
// ERROR LOGGING
// ============================================================================

/** Keys to strip from context to avoid logging secrets (passwords, tokens, etc.). */
const SENSITIVE_CONTEXT_KEYS = new Set([
  'password', 'token', 'secret', 'authorization', 'cookie', 'api_key', 'apikey',
  'access_token', 'refresh_token', 'body', 'rawBody',
]);

function sanitizeContext(ctx: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!ctx || typeof ctx !== 'object') return ctx;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ctx)) {
    const keyLower = k.toLowerCase();
    if (SENSITIVE_CONTEXT_KEYS.has(keyLower)) continue;
    if (typeof v === 'string' && v.length > 2000) out[k] = v.slice(0, 2000) + '…';
    else out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Log an error event to telemetry. Never throws; telemetry failure must not crash the app.
 */
export async function logErrorEvent(event: ErrorEvent): Promise<string | null> {
  try {
    const payload = {
      category: event.category,
      severity: event.severity,
      message: String(event.message).slice(0, 5000),
      error_code: event.error_code != null ? String(event.error_code).slice(0, 100) : null,
      stack_trace: event.stack_trace != null ? String(event.stack_trace).slice(0, 10000) : null,
      context: sanitizeContext(event.context),
      entity_type: event.entity_type != null ? String(event.entity_type).slice(0, 100) : null,
      entity_id: event.entity_id != null ? String(event.entity_id).slice(0, 500) : null,
      user_id: event.user_id != null ? String(event.user_id).slice(0, 500) : null,
      supplier_id: event.supplier_id != null ? String(event.supplier_id).slice(0, 500) : null,
      buyer_id: event.buyer_id != null ? String(event.buyer_id).slice(0, 500) : null,
      ip_address: event.ip_address != null ? String(event.ip_address).slice(0, 100) : null,
      user_agent: event.user_agent != null ? String(event.user_agent).slice(0, 500) : null,
    };
    const { data, error } = await supabaseAdmin
      .from('error_telemetry')
      .insert(payload)
      .select('id')
      .single();

    if (error) {
      console.error('Telemetry insert failed:', error.message);
      return null;
    }

    if (event.severity === 'high' || event.severity === 'critical') {
      try {
        const { captureException } = await import('../sentry');
        captureException(new Error(event.message), event.context);
      } catch {
        // never throw
      }
    }

    if (event.severity === 'critical') {
      try {
        await alertCriticalError(event);
      } catch {
        // never let alerting crash the flow
      }
    }
    return data?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Log a product search failure (productionization: structured visibility).
 */
export async function logSearchFailure(
  message: string,
  context: {
    query?: string;
    phase?: 'fts' | 'fallback' | 'count' | 'offers' | 'route';
    error_code?: string;
  }
): Promise<string | null> {
  const payload: ErrorEvent = {
    category: 'search_failure',
    severity: 'medium',
    message,
    error_code: context.error_code,
    context: { query: context.query, phase: context.phase },
  };
  try {
    return await logErrorEvent(payload);
  } catch {
    console.error(JSON.stringify({ ts: new Date().toISOString(), ...payload }));
    return null;
  }
}

/**
 * Log an ingestion failure.
 */
export async function logIngestionFailure(
  message: string,
  context: {
    supplier_id?: string;
    upload_id?: string;
    filename?: string;
    file_type?: string;
    row_number?: number;
    error_code?: string;
  }
): Promise<string | null> {
  return logErrorEvent({
    category: 'ingestion_failure',
    severity: context.row_number ? 'medium' : 'high',
    message,
    error_code: context.error_code,
    context,
    supplier_id: context.supplier_id,
    entity_type: 'feed_upload',
    entity_id: context.upload_id,
  });
}

/**
 * Log an AI extraction failure.
 */
export async function logAIExtractionFailure(
  message: string,
  context: {
    supplier_id?: string;
    product_name?: string;
    extraction_type?: string;
    confidence?: number;
    model_used?: string;
    latency_ms?: number;
    error_code?: string;
  }
): Promise<string | null> {
  return logErrorEvent({
    category: 'ai_extraction_failure',
    severity: 'medium',
    message,
    error_code: context.error_code,
    context,
    supplier_id: context.supplier_id,
  });
}

/**
 * Log a recommendation engine error.
 */
export async function logRecommendationEngineError(
  message: string,
  context: {
    product_id?: string;
    supplier_id?: string;
    operation?: string;
    recommendation_id?: string;
    error_code?: string;
  }
): Promise<string | null> {
  return logErrorEvent({
    category: 'recommendation_engine_error',
    severity: 'high',
    message,
    error_code: context.error_code,
    context,
    supplier_id: context.supplier_id,
    entity_type: 'recommendation',
    entity_id: context.recommendation_id || context.product_id,
  });
}

/**
 * Log a payment failure.
 */
export async function logPaymentFailure(
  message: string,
  context: {
    buyer_id?: string;
    order_id?: string;
    amount?: number;
    currency?: string;
    payment_method?: string;
    gateway_error?: string;
    error_code?: string;
  }
): Promise<string | null> {
  return logErrorEvent({
    category: 'payment_failure',
    severity: 'critical',
    message,
    error_code: context.error_code,
    context: {
      ...context,
      amount_sanitized: context.amount ? `${context.currency || 'USD'} ${context.amount.toFixed(2)}` : undefined,
    },
    buyer_id: context.buyer_id,
    entity_type: 'order',
    entity_id: context.order_id,
  });
}

/**
 * Log an authentication failure.
 */
export async function logAuthenticationFailure(
  message: string,
  context: {
    email?: string;
    ip_address?: string;
    user_agent?: string;
    auth_type?: 'supplier' | 'buyer' | 'admin';
    failure_reason?: string;
    error_code?: string;
  }
): Promise<string | null> {
  return logErrorEvent({
    category: 'authentication_failure',
    severity: 'medium',
    message,
    error_code: context.error_code,
    context: {
      auth_type: context.auth_type,
      failure_reason: context.failure_reason,
      // Don't log full email - just domain
      email_domain: context.email?.split('@')[1],
    },
    ip_address: context.ip_address,
    user_agent: context.user_agent,
  });
}

/**
 * Log an API/route failure (productionization: structured visibility).
 */
export async function logApiFailure(
  message: string,
  context: {
    path?: string;
    method?: string;
    status?: number;
    error_code?: string;
  }
): Promise<string | null> {
  return logErrorEvent({
    category: 'api_failure',
    severity: 'medium',
    message,
    error_code: context.error_code,
    context: { path: context.path, method: context.method, status: context.status },
  });
}

/**
 * Log a publish/staging failure (e.g. publish flow, sync).
 */
export async function logPublishFailure(
  message: string,
  context: {
    product_id?: string;
    batch_id?: string;
    phase?: string;
    error_code?: string;
  }
): Promise<string | null> {
  return logErrorEvent({
    category: 'publish_failure',
    severity: 'high',
    message,
    error_code: context.error_code,
    context: { product_id: context.product_id, batch_id: context.batch_id, phase: context.phase },
    entity_type: 'product',
    entity_id: context.product_id,
  });
}

/**
 * Log a transaction failure.
 * Do not pass rollback_successful: DB transactions auto-rollback on failure;
 * we do not track or imply client-side rollback state here.
 */
export async function logTransactionFailure(
  message: string,
  context: {
    operation?: string;
    table?: string;
    affected_rows?: number;
    error_code?: string;
  }
): Promise<string | null> {
  return logErrorEvent({
    category: 'transaction_failure',
    severity: 'high',
    message,
    error_code: context.error_code,
    context,
    entity_type: context.table,
  });
}

// ============================================================================
// ALERTING
// ============================================================================

/**
 * Alert on critical errors (webhook, email, etc.).
 */
async function alertCriticalError(event: ErrorEvent): Promise<void> {
  try {
    // Log to console with visibility
    console.error('🚨 CRITICAL ERROR:', {
      category: event.category,
      message: event.message,
      error_code: event.error_code,
      entity_type: event.entity_type,
      entity_id: event.entity_id,
      timestamp: new Date().toISOString(),
    });
    
    // Record alert
    await supabaseAdmin
      .from('error_alerts')
      .insert({
        category: event.category,
        message: event.message,
        error_code: event.error_code,
        created_at: new Date().toISOString(),
        acknowledged: false,
      });
      
    // TODO: Add webhook/email integration here
    // await sendAlertWebhook(event);
    // await sendAlertEmail(event);
  } catch {
    // Best effort
  }
}

// ============================================================================
// STATS & RETRIEVAL
// ============================================================================

const EMPTY_STATS: TelemetryStats = {
  total_errors: 0,
  by_category: {} as Record<ErrorCategory, number>,
  by_severity: {} as Record<ErrorSeverity, number>,
  error_rate_per_hour: 0,
};

/**
 * Get error statistics for a time window. Never throws; returns empty stats on failure.
 */
export async function getErrorStats(window_hours: number = 24): Promise<TelemetryStats> {
  try {
    const window = Number.isFinite(window_hours) && window_hours > 0 ? window_hours : 24;
    const cutoff = new Date(Date.now() - window * 60 * 60 * 1000).toISOString();

    const { data: errors } = await supabaseAdmin
      .from('error_telemetry')
      .select('category, severity')
      .gte('created_at', cutoff);

    const stats: TelemetryStats = {
      total_errors: Array.isArray(errors) ? errors.length : 0,
      by_category: {} as Record<ErrorCategory, number>,
      by_severity: {} as Record<ErrorSeverity, number>,
      error_rate_per_hour: 0,
    };

    if (Array.isArray(errors)) {
    for (const error of errors) {
      const category = error.category as ErrorCategory;
      const severity = error.severity as ErrorSeverity;
      
      stats.by_category[category] = (stats.by_category[category] || 0) + 1;
      stats.by_severity[severity] = (stats.by_severity[severity] || 0) + 1;
    }
    
    stats.error_rate_per_hour = window > 0 ? stats.total_errors / window : 0;
    }

    return stats;
  } catch {
    return { ...EMPTY_STATS };
  }
}

/**
 * Get recent errors. Never throws; returns [] on failure.
 */
export async function getRecentErrors(
  limit: number = 50,
  category?: ErrorCategory,
  severity?: ErrorSeverity
): Promise<ErrorEvent[]> {
  try {
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : 50;
    let query = supabaseAdmin
      .from('error_telemetry')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(safeLimit);

    if (category) query = query.eq('category', category);
    if (severity) query = query.eq('severity', severity);

    const { data } = await query;
    return Array.isArray(data) ? (data as ErrorEvent[]) : [];
  } catch {
    return [];
  }
}

/**
 * Get unacknowledged alerts. Never throws; returns [] on failure.
 */
export async function getUnacknowledgedAlerts(): Promise<Array<{
  id: string;
  category: string;
  message: string;
  created_at: string;
}>> {
  try {
    const { data } = await supabaseAdmin
      .from('error_alerts')
      .select('*')
      .eq('acknowledged', false)
      .order('created_at', { ascending: false });
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Acknowledge an alert.
 */
export async function acknowledgeAlert(alert_id: string, acknowledged_by?: string): Promise<void> {
  await supabaseAdmin
    .from('error_alerts')
    .update({
      acknowledged: true,
      acknowledged_at: new Date().toISOString(),
      acknowledged_by,
    })
    .eq('id', alert_id);
}
