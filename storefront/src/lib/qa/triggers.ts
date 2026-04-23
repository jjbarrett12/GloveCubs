/**
 * QA Supervisor - Trigger Integration
 * 
 * Functions to trigger targeted QA checks after specific agent operations.
 */

import { runTargetedAudit } from './service';
import { logger } from '../jobs/logger';
import { enqueueJob, generateDedupeKey } from '../jobs/enqueue';
import type { ProductRecord, MatchRecord, PricingRecord } from './types';

/**
 * Run QA check after product normalization
 */
export async function qaAfterNormalization(
  products: ProductRecord[],
  mode: 'dry_run' | 'apply_safe_fixes' | 'review_only' = 'apply_safe_fixes'
) {
  if (products.length === 0) return null;

  logger.info('Running QA after product normalization', { count: products.length });

  const result = await runTargetedAudit('product_intake', products, mode);

  logger.info('QA after normalization complete', {
    issues: result.summary.issues_found,
    fixes: result.summary.safe_auto_fixes_applied,
    reviews: result.summary.items_sent_to_review,
    blocked: result.summary.items_blocked,
  });

  return result;
}

/**
 * Run QA check after product matching
 */
export async function qaAfterMatching(
  matches: MatchRecord[],
  mode: 'dry_run' | 'apply_safe_fixes' | 'review_only' = 'apply_safe_fixes'
) {
  if (matches.length === 0) return null;

  logger.info('Running QA after product matching', { count: matches.length });

  const result = await runTargetedAudit('product_matching', matches, mode);

  logger.info('QA after matching complete', {
    issues: result.summary.issues_found,
    fixes: result.summary.safe_auto_fixes_applied,
    reviews: result.summary.items_sent_to_review,
    blocked: result.summary.items_blocked,
  });

  return result;
}

/**
 * Run QA check after pricing recommendation
 */
export async function qaAfterPricing(
  recommendations: PricingRecord[],
  mode: 'dry_run' | 'apply_safe_fixes' | 'review_only' = 'apply_safe_fixes'
) {
  if (recommendations.length === 0) return null;

  logger.info('Running QA after pricing recommendations', { count: recommendations.length });

  const result = await runTargetedAudit('competitive_pricing', recommendations, mode);

  logger.info('QA after pricing complete', {
    issues: result.summary.issues_found,
    fixes: result.summary.safe_auto_fixes_applied,
    reviews: result.summary.items_sent_to_review,
    blocked: result.summary.items_blocked,
  });

  return result;
}

/**
 * Schedule a full nightly audit job
 */
export async function scheduleNightlyAudit(): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  
  await enqueueJob({
    job_type: 'audit_run',
    payload: {
      full_audit: true,
      modules: [
        'supplier_discovery',
        'product_intake',
        'product_matching',
        'competitive_pricing',
        'daily_price_guard',
      ],
    },
    dedupe_key: generateDedupeKey('audit_run', undefined, undefined, `nightly:${today}`),
    priority: 60,
  });

  logger.info('Nightly audit scheduled', { date: today });
}

/**
 * Schedule a targeted audit job for a specific module
 */
export async function scheduleTargetedAudit(
  module: string,
  sourceIds?: string[]
): Promise<void> {
  const timestamp = Date.now().toString(36);
  
  await enqueueJob({
    job_type: 'audit_run',
    payload: {
      full_audit: false,
      modules: [module],
      source_ids: sourceIds,
    },
    dedupe_key: generateDedupeKey('audit_run', module, undefined, timestamp),
    priority: 55,
  });

  logger.info('Targeted audit scheduled', { module, source_ids: sourceIds?.length });
}

/**
 * Check if any blocked actions exist for a record
 */
export async function hasBlockedActions(
  sourceTable: string,
  sourceId: string
): Promise<boolean> {
  const { supabaseAdmin } = await import('../jobs/supabase');
  
  const { data } = await supabaseAdmin
    .from('blocked_actions')
    .select('id')
    .eq('source_table', sourceTable)
    .eq('source_id', sourceId)
    .eq('status', 'active')
    .limit(1);

  return (data?.length ?? 0) > 0;
}

/**
 * Get blocked action reasons for a record
 */
export async function getBlockedReasons(
  sourceTable: string,
  sourceId: string
): Promise<string[]> {
  const { supabaseAdmin } = await import('../jobs/supabase');
  
  const { data } = await supabaseAdmin
    .from('blocked_actions')
    .select('reason_blocked')
    .eq('source_table', sourceTable)
    .eq('source_id', sourceId)
    .eq('status', 'active');

  return (data ?? []).map(r => r.reason_blocked);
}
