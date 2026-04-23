/**
 * Audit Run Job Handler
 * 
 * Executes the QA Supervisor audit across domain and operational modules.
 * 
 * Domain Modules (actual business QA):
 * - supplier_discovery: Audit supplier legitimacy, duplicates, classification
 * - product_intake: Audit product normalization, field quality, case math
 * - product_matching: Audit match confidence, false matches, conflicts
 * - competitive_pricing: Audit margin floors, MAP violations, price swings
 * - daily_price_guard: Audit action queue quality, duplicates
 * 
 * Operational Modules (system health):
 * - ops_job_health: Job queue failure rates, blocked jobs
 * - ops_review_backlog: Review queue staleness, duplicates
 * 
 * Execution Modes:
 * - dry_run: No mutations, no persistence
 * - apply_safe_fixes: Log Level 1 fixes to fix_logs (source tables NOT updated)
 * - review_only: Create review items only, no fix logging
 * 
 * Schedule: Nightly (full audit) or on-demand (targeted audit)
 */

import { logger } from '../logger';
import { runQAAudit } from '../../qa';
import { createReviewItem } from '../../review/createReviewItem';
import { generateAuditSummary } from '../../ai/ops-copilot';
import type { 
  JobExecutionResult, 
  AuditRunPayload,
  ReviewQueueCreateInput,
} from '../../agents/types';
import type { QAExecutionMode, QAAuditModule, QAReviewItem } from '../../qa/types';

export async function handleAuditRun(
  payload: Record<string, unknown>
): Promise<JobExecutionResult> {
  const input = payload as AuditRunPayload;
  const reviewItems: ReviewQueueCreateInput[] = [];

  try {
    logger.info('Starting audit run via job handler', {
      modules: input.modules,
      full_audit: input.full_audit,
      since: input.since,
      dry_run: input.dry_run,
      review_only: input.review_only,
    });

    // Determine execution mode
    let mode: QAExecutionMode = 'apply_safe_fixes';
    if (input.dry_run === true) {
      mode = 'dry_run';
    } else if (input.review_only === true) {
      mode = 'review_only';
    }

    // Run the QA audit (this loads data from DB and runs all audits)
    const result = await runQAAudit({
      mode,
      scope: input.full_audit ? 'full' : 'targeted',
      modules: input.modules as QAAuditModule[] | undefined,
      since: input.since ? new Date(input.since) : undefined,
      triggered_by: 'audit_run_job',
      job_id: (payload._triggered_by as string) || undefined,
    });

    // EXPLICIT REVIEW ITEM PERSISTENCE
    // The QA service persists review items internally, but we also
    // track them here for the job runner's return value
    let reviewItemsCreated = 0;
    for (const item of result.review_items) {
      const converted = convertToReviewInput(item, result.run_id);
      
      // In dry_run mode, don't persist, just track
      if (mode !== 'dry_run') {
        const created = await createReviewItem(converted);
        if (created) {
          reviewItemsCreated++;
        }
      }
      
      // Always add to return value for job runner visibility
      reviewItems.push(converted);
    }

    // Log what happened with reviews
    if (mode !== 'dry_run' && reviewItemsCreated > 0) {
      logger.info('Review items created by audit handler', {
        requested: result.review_items.length,
        created: reviewItemsCreated,
        deduplicated: result.review_items.length - reviewItemsCreated,
      });
    }

    // Check if audit failed
    if (result.status === 'failed') {
      return {
        success: false,
        error: result.self_audit.validation_notes.join('; ') || 'Audit failed',
        output: buildOutputPayload(result, mode, reviewItemsCreated),
        reviewItems,
      };
    }

    // Generate AI ops summary for the audit run
    if (mode !== 'dry_run' && result.persisted.audit_report_id) {
      try {
        await generateAuditSummary(result.persisted.audit_report_id);
        logger.info('Generated AI ops summary for audit run');
      } catch (e) {
        logger.warn('Failed to generate AI ops summary', { 
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return {
      success: true,
      output: buildOutputPayload(result, mode, reviewItemsCreated),
      reviewItems,
    };

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Audit run handler failed', { error: message });
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Convert QA review item to job framework format
 */
function convertToReviewInput(
  item: QAReviewItem,
  auditRunId: string
): ReviewQueueCreateInput {
  return {
    review_type: mapModuleToReviewType(item.module),
    priority: item.priority,
    source_table: item.source_table,
    source_id: item.source_id,
    title: `Audit Finding: ${item.issue_category}`,
    issue_category: item.issue_category,
    issue_summary: item.issue_summary,
    recommended_action: item.recommended_action,
    agent_name: 'audit_supervisor',
    details: {
      audit_run_id: auditRunId,
      module: item.module,
      record_type: item.record_type,
      record_id: item.record_id,
      dedupe_key: item.dedupe_key,
      ...item.details,
    },
  };
}

/**
 * Build detailed output payload for job result
 */
function buildOutputPayload(
  result: ReturnType<typeof runQAAudit> extends Promise<infer T> ? T : never,
  mode: QAExecutionMode,
  reviewItemsCreated: number
): Record<string, unknown> {
  // Separate domain modules from ops modules
  const domainModules = result.module_results.filter(m => 
    !m.module.startsWith('ops_')
  );
  const opsModules = result.module_results.filter(m => 
    m.module.startsWith('ops_')
  );

  // Calculate accurate metrics
  const actualFixesLogged = result.fixes.filter(f => f.was_applied).length;
  const suggestedFixes = result.fixes.filter(f => !f.was_applied && !f.skipped_reason).length;
  const skippedFixes = result.fixes.filter(f => f.skipped_reason).length;

  return {
    // Identifiers
    report_id: result.persisted.audit_report_id,
    run_id: result.run_id,
    
    // Execution info
    mode: result.mode,
    scope: result.scope,
    run_type: result.run_type,
    
    // Summary with accurate descriptions
    summary: {
      records_audited: result.summary.records_audited,
      issues_found: result.summary.issues_found,
      fixes_logged_to_fix_logs: actualFixesLogged,
      suggested_fixes_not_applied: suggestedFixes,
      skipped_fixes: skippedFixes,
      review_items_created: reviewItemsCreated,
      items_blocked: result.summary.items_blocked,
      systemic_issues: result.systemic_issues.length,
    },
    
    // Domain audit results
    domain_audits: domainModules.map(m => ({
      module: m.module,
      records_checked: m.records_checked,
      issues_found: m.issues_found,
      fixes: m.fixes_applied,
      reviews: m.review_items_created,
      blocked: m.blocked_items,
      notes: m.notes,
    })),
    
    // Operational health results
    ops_health: opsModules.map(m => ({
      module: m.module,
      records_checked: m.records_checked,
      issues_found: m.issues_found,
      notes: m.notes,
    })),
    
    // Systemic issues requiring attention
    systemic_issues: result.systemic_issues.map(s => ({
      issue: s.issue,
      impact: s.impact,
      recommended_fix: s.recommended_fix,
      occurrences: s.occurrence_count,
      module: s.affected_module,
    })),
    
    // Next steps
    next_steps: result.next_steps,
    
    // Self-audit results
    self_audit: {
      passed: result.self_audit.passed,
      issues: result.self_audit.validation_notes,
      flags: {
        guessed_anywhere: result.self_audit.guessed_anywhere,
        unsafe_automation: result.self_audit.allowed_unsafe_automation,
        missed_confidence_downgrade: result.self_audit.missed_confidence_downgrade,
        missed_duplicate_risk: result.self_audit.missed_duplicate_risk,
        missed_systemic_pattern: result.self_audit.missed_systemic_pattern,
      },
    },
    
    // Persistence tracking
    persisted: result.persisted,
    
    // Mode-specific notes
    mode_notes: getModeNotes(mode),
  };
}

/**
 * Get notes about what the current mode does
 */
function getModeNotes(mode: QAExecutionMode): string[] {
  switch (mode) {
    case 'dry_run':
      return [
        'Dry run mode - no mutations were made',
        'No fix_logs were created',
        'No review items were persisted',
        'Results are preview only',
      ];
    case 'review_only':
      return [
        'Review-only mode',
        'Review items were created',
        'No fix_logs were created',
        'Source tables were not modified',
      ];
    case 'apply_safe_fixes':
      return [
        'Apply safe fixes mode',
        'Level 1 fixes were logged to fix_logs',
        'NOTE: Source tables were NOT updated',
        'Review items were created',
        'To apply fixes to source tables, implement table-specific update functions',
      ];
  }
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
    ops_job_health: 'system',
    ops_review_backlog: 'audit',
    job_queue: 'system', // Legacy name support
    review_queue: 'audit', // Legacy name support
  };
  return mapping[module] ?? 'audit';
}
