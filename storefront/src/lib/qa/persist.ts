/**
 * QA Supervisor - Persistence Layer
 * 
 * Handles saving audit results, fix logs, and blocked actions to database.
 */

import { supabaseAdmin } from '../jobs/supabase';
import { logger } from '../jobs/logger';
import { createReviewItem } from '../review/createReviewItem';
import type {
  QAAuditResult,
  QAFix,
  QABlockedAction,
  QAReviewItem,
} from './types';
import type { ReviewQueueCreateInput } from '../agents/types';

/**
 * Persist an audit result to the database
 */
export async function persistAuditResult(
  result: QAAuditResult
): Promise<{ audit_report_id: string | null; errors: string[] }> {
  const errors: string[] = [];
  let auditReportId: string | null = null;

  try {
    // 1. Store audit report
    const { data: report, error: reportError } = await supabaseAdmin
      .from('audit_reports')
      .insert({
        run_type: result.run_type,
        status: result.status,
        summary: result.summary,
        module_results: result.module_results,
        fixes: result.fixes,
        review_items: result.review_items,
        blocked_actions: result.blocked_actions,
        systemic_issues: result.systemic_issues,
        next_steps: result.next_steps,
        self_audit: result.self_audit,
        started_at: result.run_timestamp,
        completed_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (reportError) {
      errors.push(`Failed to save audit report: ${reportError.message}`);
      logger.error('Failed to persist audit report', { error: reportError.message });
    } else {
      auditReportId = report.id;
      logger.info('Audit report persisted', { report_id: report.id });
    }

    // 2. Store fix logs
    const fixLogCount = await persistFixLogs(result.fixes, auditReportId);
    result.persisted.fix_logs_created = fixLogCount;

    // 3. Store blocked actions
    const blockedCount = await persistBlockedActions(result.blocked_actions, auditReportId);
    result.persisted.blocked_actions_created = blockedCount;

    // 4. Create review queue items
    const reviewCount = await persistReviewItems(result.review_items);
    result.persisted.review_items_created = reviewCount;

    result.persisted.audit_report_id = auditReportId ?? undefined;

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`Persistence error: ${message}`);
    logger.error('Failed to persist audit result', { error: message });
  }

  return { audit_report_id: auditReportId, errors };
}

/**
 * Persist fix logs with idempotency check using dedupe_key
 */
async function persistFixLogs(
  fixes: QAFix[],
  auditReportId: string | null
): Promise<number> {
  if (fixes.length === 0) return 0;

  let created = 0;
  let skipped = 0;

  for (const fix of fixes) {
    // Use dedupe_key if available, otherwise fallback to source-based check
    if (fix.dedupe_key) {
      // Check if this exact fix was already logged recently
      const { data: existing } = await supabaseAdmin
        .from('fix_logs')
        .select('id')
        .eq('record_id', fix.record_id)
        .eq('issue_found', fix.issue_found)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(1);

      if (existing && existing.length > 0) {
        logger.debug('Fix already logged recently, skipping', {
          dedupe_key: fix.dedupe_key,
        });
        skipped++;
        continue;
      }
    } else if (fix.source_id) {
      // Fallback to RPC check
      const { data: alreadyApplied } = await supabaseAdmin.rpc('check_fix_already_applied', {
        p_source_table: fix.source_table ?? null,
        p_source_id: fix.source_id,
        p_issue_found: fix.issue_found,
        p_hours_lookback: 24,
      });

      if (alreadyApplied) {
        logger.debug('Fix already applied, skipping', {
          source: `${fix.source_table}:${fix.source_id}`,
          issue: fix.issue_found,
        });
        skipped++;
        continue;
      }
    }

    const { error } = await supabaseAdmin
      .from('fix_logs')
      .insert({
        audit_report_id: auditReportId,
        module: fix.module,
        record_type: fix.record_type,
        record_id: fix.record_id,
        source_table: fix.source_table,
        source_id: fix.source_id,
        issue_found: fix.issue_found,
        fix_applied: fix.fix_applied,
        prior_values: fix.prior_values,
        new_values: fix.new_values,
        confidence_before: fix.confidence_before,
        confidence_after: fix.confidence_after,
        fix_level: fix.fix_level,
        was_applied: fix.was_applied,
        applied_at: fix.was_applied ? new Date().toISOString() : null,
      });

    if (error) {
      // Handle unique constraint (duplicate)
      if (error.code !== '23505') {
        logger.error('Failed to persist fix log', { 
          error: error.message,
          record: fix.record_id,
        });
      } else {
        skipped++;
      }
    } else {
      created++;
    }
  }

  if (created > 0 || skipped > 0) {
    logger.info('Fix logs persisted', { created, skipped_duplicates: skipped });
  }

  return created;
}

/**
 * Persist blocked actions with idempotency check
 */
async function persistBlockedActions(
  blockedActions: QABlockedAction[],
  auditReportId: string | null
): Promise<number> {
  if (blockedActions.length === 0) return 0;

  let created = 0;

  for (const blocked of blockedActions) {
    // Check idempotency - skip if already blocked
    if (blocked.source_id) {
      const { data: alreadyBlocked } = await supabaseAdmin.rpc('check_action_already_blocked', {
        p_source_table: blocked.source_table ?? null,
        p_source_id: blocked.source_id,
        p_reason: blocked.reason_blocked,
      });

      if (alreadyBlocked) {
        logger.debug('Action already blocked, skipping', {
          source: `${blocked.source_table}:${blocked.source_id}`,
          reason: blocked.reason_blocked,
        });
        continue;
      }
    }

    const { error } = await supabaseAdmin
      .from('blocked_actions')
      .insert({
        audit_report_id: auditReportId,
        module: blocked.module,
        record_type: blocked.record_type,
        record_id: blocked.record_id,
        source_table: blocked.source_table,
        source_id: blocked.source_id,
        reason_blocked: blocked.reason_blocked,
        severity: blocked.severity,
        details: blocked.details ?? {},
      });

    if (error) {
      if (error.code !== '23505') {
        logger.error('Failed to persist blocked action', {
          error: error.message,
          record: blocked.record_id,
        });
      }
    } else {
      created++;
    }
  }

  if (created > 0) {
    logger.info('Blocked actions persisted', { count: created });
  }

  return created;
}

/**
 * Create review queue items from audit findings
 */
async function persistReviewItems(
  reviewItems: QAReviewItem[]
): Promise<number> {
  if (reviewItems.length === 0) return 0;

  let created = 0;

  for (const item of reviewItems) {
    const input: ReviewQueueCreateInput = {
      review_type: mapModuleToReviewType(item.module),
      priority: item.priority,
      source_table: item.source_table,
      source_id: item.source_id,
      title: `QA Audit: ${item.issue_category}`,
      issue_category: item.issue_category,
      issue_summary: item.issue_summary,
      recommended_action: item.recommended_action,
      agent_name: 'audit_supervisor',
      details: {
        module: item.module,
        record_type: item.record_type,
        record_id: item.record_id,
        ...item.details,
      },
    };

    const result = await createReviewItem(input);
    if (result) {
      created++;
    }
  }

  if (created > 0) {
    logger.info('Review items created from audit', { count: created });
  }

  return created;
}

/**
 * Map audit module to review type
 */
function mapModuleToReviewType(
  module: string
): 'supplier' | 'catalog' | 'product_match' | 'pricing' | 'audit' | 'system' {
  const mapping: Record<string, 'supplier' | 'catalog' | 'product_match' | 'pricing' | 'audit' | 'system'> = {
    supplier_discovery: 'supplier',
    product_intake: 'catalog',
    product_matching: 'product_match',
    competitive_pricing: 'pricing',
    daily_price_guard: 'pricing',
    job_queue: 'system',
    review_queue: 'audit',
  };
  return mapping[module] ?? 'audit';
}

/**
 * Resolve a blocked action
 */
export async function resolveBlockedAction(
  id: string,
  resolvedBy: string,
  notes?: string
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('blocked_actions')
    .update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      resolved_by: resolvedBy,
      resolved_notes: notes,
    })
    .eq('id', id)
    .eq('status', 'active');

  if (error) {
    logger.error('Failed to resolve blocked action', { id, error: error.message });
    return false;
  }

  return true;
}

/**
 * Get active blocked actions
 */
export async function getActiveBlockedActions(
  module?: string,
  severity?: string
): Promise<QABlockedAction[]> {
  let query = supabaseAdmin
    .from('blocked_actions')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (module) {
    query = query.eq('module', module);
  }
  if (severity) {
    query = query.eq('severity', severity);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('Failed to get blocked actions', { error: error.message });
    return [];
  }

  return data as QABlockedAction[];
}

/**
 * Get recent fix logs
 */
export async function getRecentFixLogs(
  hours: number = 24,
  module?: string
): Promise<QAFix[]> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  let query = supabaseAdmin
    .from('fix_logs')
    .select('*')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false });

  if (module) {
    query = query.eq('module', module);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('Failed to get fix logs', { error: error.message });
    return [];
  }

  return data.map(row => ({
    module: row.module,
    record_type: row.record_type,
    record_id: row.record_id,
    source_table: row.source_table,
    source_id: row.source_id,
    issue_found: row.issue_found,
    fix_applied: row.fix_applied,
    prior_values: row.prior_values,
    new_values: row.new_values,
    confidence_before: row.confidence_before,
    confidence_after: row.confidence_after,
    fix_level: row.fix_level as 1 | 2 | 3,
    audit_note: '',
    was_applied: row.was_applied,
  }));
}
