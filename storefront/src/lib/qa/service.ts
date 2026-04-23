/**
 * QA Supervisor - Main Service
 * 
 * Production-integrated QA supervisor.
 * 
 * IMPORTANT LIMITATIONS:
 * - This service DETECTS issues and LOGS fixes to fix_logs table
 * - It does NOT actually write corrections to source tables
 * - The `was_applied` flag indicates the fix was LOGGED, not applied to source
 * - To actually apply fixes, you must implement table-specific update logic
 */

import { supabaseAdmin } from '../jobs/supabase';
import { logger } from '../jobs/logger';
import { loadQAConfig } from './config';
import { persistAuditResult } from './persist';
import { validateAuditInput, generateFixDedupeKey, generateReviewDedupeKey, generateBlockedDedupeKey } from './validate';
import { loadAuditData, loadOpsHealthData, type AuditDataSet } from './loader';
import type {
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

/**
 * Run a full QA audit
 * 
 * NOTE: This does NOT apply fixes to source tables.
 * It detects issues, logs them, and persists audit trail.
 */
export async function runQAAudit(input: QAAuditInput): Promise<QAAuditResult> {
  const runId = crypto.randomUUID();
  const startTime = new Date();
  
  logger.info('Starting QA audit', {
    run_id: runId,
    mode: input.mode,
    scope: input.scope,
    modules: input.modules,
  });

  // Validate input
  const validation = validateAuditInput(input);
  if (!validation.valid) {
    logger.error('Invalid audit input', { errors: validation.errors });
    throw new Error(`Invalid audit input: ${validation.errors.join('; ')}`);
  }
  if (validation.warnings.length > 0) {
    logger.warn('Audit input warnings', { warnings: validation.warnings });
  }

  // Load configuration from database
  const config = await loadQAConfig();

  // Initialize result
  const result: QAAuditResult = {
    run_id: runId,
    run_type: input.mode === 'dry_run' ? 'dry_run' : input.mode === 'review_only' ? 'review_only' : 'audit_and_fix',
    run_timestamp: startTime.toISOString(),
    mode: input.mode,
    scope: input.scope,
    status: 'completed',
    summary: createEmptySummary(),
    module_results: [],
    fixes: [],
    review_items: [],
    blocked_actions: [],
    systemic_issues: [],
    next_steps: [],
    self_audit: createEmptySelfAudit(),
    persisted: {
      fix_logs_created: 0,
      blocked_actions_created: 0,
      review_items_created: 0,
    },
  };

  try {
    // Determine which modules to audit
    const domainModules = [
      'supplier_discovery',
      'product_intake', 
      'product_matching',
      'competitive_pricing',
      'daily_price_guard',
    ];
    const modulesToAudit = input.scope === 'full' 
      ? domainModules 
      : (input.modules ?? []).filter(m => domainModules.includes(m));

    // Load domain data from database (or use provided data)
    const data = await loadAuditData(input, modulesToAudit);

    // Run domain module audits
    if (shouldAuditModule('supplier_discovery', input)) {
      auditSupplierDiscovery(data.suppliers, config, result);
    }
    if (shouldAuditModule('product_intake', input)) {
      auditProductIntake(data.products, config, result);
    }
    if (shouldAuditModule('product_matching', input)) {
      auditProductMatching(data.matches, config, result);
    }
    if (shouldAuditModule('competitive_pricing', input)) {
      auditCompetitivePricing(data.pricing, config, result);
    }
    if (shouldAuditModule('daily_price_guard', input)) {
      auditDailyPriceGuard(data.actions, config, result);
    }

    // Full audits also check operational health
    if (input.scope === 'full') {
      const opsData = await loadOpsHealthData(input.since ?? new Date(Date.now() - 24 * 60 * 60 * 1000));
      auditOpsJobHealth(opsData.jobs, result);
      auditOpsReviewBacklog(opsData.reviews, result);
    }

    // Run cross-checks
    runCrossChecks(data, config, result);

    // Identify systemic issues
    identifySystemicIssues(config, result);

    // Self-audit
    performSelfAudit(result);

    // Generate next steps
    result.next_steps = generateNextSteps(result);

    // Handle fixes based on mode
    if (input.mode === 'apply_safe_fixes' && config.enable_safe_auto_fixes) {
      // Apply fixes (logs to fix_logs, does NOT update source tables)
      await applyLevel1Fixes(result);
    } else {
      // dry_run or review_only - just count suggested fixes
      countSuggestedFixes(result);
    }

    // Persist results (except in dry_run mode)
    if (input.mode !== 'dry_run') {
      const { errors } = await persistAuditResult(result);
      if (errors.length > 0) {
        result.self_audit.validation_notes.push(...errors);
      }
    } else {
      logger.info('Dry run - no persistence', { run_id: runId });
    }

  } catch (error) {
    result.status = 'failed';
    const message = error instanceof Error ? error.message : String(error);
    result.self_audit.validation_notes.push(`Audit failed: ${message}`);
    logger.error('QA audit failed', { run_id: runId, error: message });
  }

  const duration = Date.now() - startTime.getTime();
  logger.info('QA audit completed', {
    run_id: runId,
    status: result.status,
    duration_ms: duration,
    summary: result.summary,
  });

  return result;
}

/**
 * Run a targeted audit for a specific module
 */
export async function runTargetedAudit(
  module: string,
  records: unknown[],
  mode: 'dry_run' | 'apply_safe_fixes' | 'review_only' = 'apply_safe_fixes'
): Promise<QAAuditResult> {
  const input: QAAuditInput = {
    mode,
    scope: 'targeted',
    modules: [module as any],
  };

  // Map records to correct field
  switch (module) {
    case 'supplier_discovery':
      input.suppliers = records as SupplierRecord[];
      break;
    case 'product_intake':
      input.products = records as ProductRecord[];
      break;
    case 'product_matching':
      input.matches = records as MatchRecord[];
      break;
    case 'competitive_pricing':
      input.pricing = records as PricingRecord[];
      break;
    case 'daily_price_guard':
      input.actions = records as ActionRecord[];
      break;
  }

  return runQAAudit(input);
}

// ============================================================================
// HELPERS
// ============================================================================

function createEmptySummary(): QAAuditSummary {
  return {
    records_audited: 0,
    issues_found: 0,
    safe_auto_fixes_applied: 0,
    safe_auto_fixes_skipped: 0,
    suggested_fixes: 0,
    items_sent_to_review: 0,
    items_blocked: 0,
    systemic_issues_found: 0,
  };
}

function createEmptySelfAudit(): QASelfAudit {
  return {
    passed: true,
    guessed_anywhere: false,
    allowed_unsafe_automation: false,
    missed_confidence_downgrade: false,
    missed_duplicate_risk: false,
    missed_systemic_pattern: false,
    validation_notes: [],
  };
}

function shouldAuditModule(module: string, input: QAAuditInput): boolean {
  if (input.scope === 'full') return true;
  if (!input.modules) return false;
  return input.modules.includes(module as any);
}

// Data loading is now handled by loader.ts
// See: loadAuditData() in ./loader.ts

// ============================================================================
// MODULE AUDITS
// ============================================================================

function auditSupplierDiscovery(
  suppliers: SupplierRecord[],
  config: QAConfig,
  result: QAAuditResult
): void {
  if (suppliers.length === 0) return;

  const moduleResult: QAModuleResult = {
    module: 'supplier_discovery',
    records_checked: 0,
    issues_found: 0,
    fixes_applied: 0,
    fixes_skipped: 0,
    review_items_created: 0,
    blocked_items: 0,
    notes: [],
  };

  const seen = new Map<string, SupplierRecord>();

  for (const supplier of suppliers) {
    moduleResult.records_checked++;
    result.summary.records_audited++;

    // Duplicate check
    const key = normalizeSupplierKey(supplier);
    if (seen.has(key)) {
      const existing = seen.get(key)!;
      if ((supplier.trust_score ?? 0) < (existing.trust_score ?? 0)) {
        result.blocked_actions.push({
          module: 'supplier_discovery',
          record_type: 'supplier',
          record_id: supplier.id || supplier.name,
          reason_blocked: 'Duplicate supplier - lower trust score version',
          severity: 'medium',
        });
        moduleResult.blocked_items++;
        result.summary.items_blocked++;
        moduleResult.issues_found++;
        result.summary.issues_found++;
        continue;
      }
    }
    seen.set(key, supplier);

    // Legitimacy check
    const legitimacyIssues = checkSupplierLegitimacy(supplier);
    if (legitimacyIssues.length > 0) {
      moduleResult.issues_found += legitimacyIssues.length;
      result.summary.issues_found += legitimacyIssues.length;

      result.review_items.push({
        module: 'supplier_discovery',
        record_type: 'supplier',
        record_id: supplier.id || supplier.name,
        issue_category: 'supplier_legitimacy',
        issue_summary: legitimacyIssues.join('; '),
        recommended_action: 'VERIFY - Confirm supplier is legitimate wholesaler',
        priority: legitimacyIssues.length > 2 ? 'high' : 'medium',
      });
      moduleResult.review_items_created++;
      result.summary.items_sent_to_review++;
    }

    // Normalizations
    applySupplierNormalizations(supplier, config, result, moduleResult);
  }

  result.module_results.push(moduleResult);
}

function normalizeSupplierKey(supplier: SupplierRecord): string {
  const name = (supplier.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  let domain = '';
  try {
    domain = new URL(supplier.website || supplier.url || '').hostname.replace('www.', '');
  } catch {
    domain = (supplier.website || supplier.url || '').toLowerCase().replace(/[^a-z0-9.]/g, '');
  }
  return `${name}|${domain}`;
}

function checkSupplierLegitimacy(supplier: SupplierRecord): string[] {
  const issues: string[] = [];
  
  if (!supplier.website && !supplier.url) {
    issues.push('No website provided');
  } else {
    const site = (supplier.website || supplier.url || '').toLowerCase();
    if (site.includes('amazon.') || site.includes('ebay.') || site.includes('walmart.')) {
      issues.push('Website is a retail marketplace, not a wholesale supplier');
    }
  }
  
  if (!supplier.contact_email && !supplier.phone) {
    issues.push('Missing contact information');
  }
  
  if (supplier.type === 'retailer' || supplier.supplier_type === 'retailer') {
    issues.push('Classified as retailer, not wholesaler');
  }
  
  if (supplier.trust_score !== undefined && supplier.trust_score < 0.5) {
    issues.push(`Low trust score: ${supplier.trust_score}`);
  }
  
  return issues;
}

function applySupplierNormalizations(
  supplier: SupplierRecord,
  config: QAConfig,
  result: QAAuditResult,
  moduleResult: QAModuleResult
): void {
  // Normalize type
  const type = (supplier.type || supplier.supplier_type || '').toLowerCase();
  if (type && !['wholesaler', 'distributor', 'manufacturer', 'retailer'].includes(type)) {
    const normalized = type.includes('whole') ? 'wholesaler'
      : type.includes('dist') ? 'distributor'
      : type.includes('manu') ? 'manufacturer'
      : type.includes('ret') ? 'retailer' : null;
    
    if (normalized) {
      const recordId = supplier.id || supplier.name;
      result.fixes.push({
        module: 'supplier_discovery',
        record_type: 'supplier',
        record_id: recordId,
        dedupe_key: generateFixDedupeKey('supplier_discovery', 'supplier', recordId, `type_normalize_${type}`),
        issue_found: `Non-standard supplier type: ${type}`,
        fix_applied: `Normalized to: ${normalized}`,
        prior_values: { type },
        new_values: { type: normalized },
        confidence_after: 0.95,
        fix_level: 1,
        audit_note: 'Safe mechanical normalization',
        was_applied: false, // Will be set true by applyLevel1Fixes if mode allows
      });
      // FIX: Only increment fixes_applied counter; safe_auto_fixes_applied is set by applyLevel1Fixes
      moduleResult.fixes_applied++;
      // DO NOT increment result.summary.safe_auto_fixes_applied here - it's set after applyLevel1Fixes
    }
  }

  // Trim whitespace
  if (supplier.name && supplier.name !== supplier.name.trim()) {
    const trimmed = supplier.name.trim();
    const recordId = supplier.id || supplier.name;
    result.fixes.push({
      module: 'supplier_discovery',
      record_type: 'supplier',
      record_id: recordId,
      dedupe_key: generateFixDedupeKey('supplier_discovery', 'supplier', recordId, 'whitespace_trim'),
      issue_found: 'Extra whitespace in supplier name',
      fix_applied: 'Trimmed whitespace',
      prior_values: { name: supplier.name },
      new_values: { name: trimmed },
      confidence_after: 1.0,
      fix_level: 1,
      audit_note: 'Safe formatting fix',
      was_applied: false,
    });
    // FIX: Only increment fixes_applied counter; safe_auto_fixes_applied is set by applyLevel1Fixes
    moduleResult.fixes_applied++;
    // DO NOT increment result.summary.safe_auto_fixes_applied here - it's set after applyLevel1Fixes
  }
}

function auditProductIntake(
  products: ProductRecord[],
  config: QAConfig,
  result: QAAuditResult
): void {
  if (products.length === 0) return;

  const moduleResult: QAModuleResult = {
    module: 'product_intake',
    records_checked: 0,
    issues_found: 0,
    fixes_applied: 0,
    fixes_skipped: 0,
    review_items_created: 0,
    blocked_items: 0,
    notes: [],
  };

  for (const product of products) {
    moduleResult.records_checked++;
    result.summary.records_audited++;

    const issues: string[] = [];
    const recordId = product.id || product.sku || product.supplier_sku || 'unknown';

    // Required field checks
    if (!product.brand) issues.push('Missing brand');
    if (!product.material) issues.push('Missing material');
    if (!product.units_per_box) issues.push('Missing units_per_box');

    // Case math check
    const upb = parseFloat(String(product.units_per_box));
    const bpc = parseFloat(String(product.boxes_per_case));
    const total = parseFloat(String(product.total_units_per_case));
    
    if (!isNaN(upb) && !isNaN(bpc)) {
      const expected = upb * bpc;
      if (!isNaN(total) && total !== expected) {
        issues.push(`Case math incorrect: ${upb} × ${bpc} ≠ ${total}`);
        result.fixes.push({
          module: 'product_intake',
          record_type: 'product',
          record_id: recordId,
          issue_found: `Incorrect total_units_per_case: ${total}`,
          fix_applied: `Corrected to: ${expected}`,
          prior_values: { total_units_per_case: total },
          new_values: { total_units_per_case: expected },
          confidence_after: 0.95,
          fix_level: 1,
          audit_note: 'Math correction from verified components',
          was_applied: false, // Set by applyLevel1Fixes
        });
        moduleResult.fixes_applied++;
        // Counter updated by applyLevel1Fixes
      }
    }

    // Attribute normalization
    applyProductNormalizations(product, config, result, moduleResult, recordId);

    // Thickness sanity
    const thickness = parseFloat(String(product.thickness_mil || product.thickness));
    if (!isNaN(thickness) && (thickness < 1 || thickness > 15)) {
      issues.push(`Suspicious thickness: ${thickness} mil`);
    }

    // Confidence audit
    const confidence = product.parse_confidence ?? 1.0;
    const missingCount = issues.filter(i => i.includes('Missing')).length;
    
    if (confidence > 0.90 && missingCount > 0) {
      const newConfidence = Math.max(0.30, Math.min(confidence, 0.80) - (missingCount * 0.10));
      result.fixes.push({
        module: 'product_intake',
        record_type: 'product',
        record_id: recordId,
        issue_found: `Confidence ${confidence} inflated given ${missingCount} missing fields`,
        fix_applied: `Downgraded to: ${newConfidence.toFixed(2)}`,
        prior_values: { parse_confidence: confidence },
        new_values: { parse_confidence: newConfidence },
        confidence_before: confidence,
        confidence_after: newConfidence,
        fix_level: 1,
        audit_note: 'Confidence correction',
        was_applied: false, // Set by applyLevel1Fixes
      });
      moduleResult.fixes_applied++;
      // Counter updated by applyLevel1Fixes
    }

    // Record issues
    moduleResult.issues_found += issues.length;
    result.summary.issues_found += issues.length;

    // Create review item for critical issues
    const criticalIssues = issues.filter(i => 
      i.includes('Missing') || i.includes('conflict') || i.includes('suspicious')
    );
    
    if (criticalIssues.length > 0) {
      result.review_items.push({
        module: 'product_intake',
        record_type: 'product',
        record_id: recordId,
        issue_category: 'catalog_quality',
        issue_summary: criticalIssues.join('; '),
        recommended_action: 'VERIFY - Check product data before publishing',
        priority: criticalIssues.length >= 3 ? 'high' : 'medium',
      });
      moduleResult.review_items_created++;
      result.summary.items_sent_to_review++;
    }
  }

  result.module_results.push(moduleResult);
}

function applyProductNormalizations(
  product: ProductRecord,
  config: QAConfig,
  result: QAAuditResult,
  moduleResult: QAModuleResult,
  recordId: string
): void {
  // Normalize color
  if (product.color) {
    const lower = product.color.toLowerCase();
    const normalized = config.color_normalize[lower];
    if (normalized && normalized !== lower) {
      result.fixes.push({
        module: 'product_intake',
        record_type: 'product',
        record_id: recordId,
        issue_found: `Non-standard color: ${product.color}`,
        fix_applied: `Normalized to: ${normalized}`,
        prior_values: { color: product.color },
        new_values: { color: normalized },
        confidence_after: 0.98,
        fix_level: 1,
        audit_note: 'Safe color normalization',
        was_applied: false, // Set by applyLevel1Fixes
      });
      moduleResult.fixes_applied++;
      // Counter updated by applyLevel1Fixes
    }
  }

  // Normalize material
  if (product.material) {
    const lower = product.material.toLowerCase();
    const normalized = config.material_normalize[lower];
    if (normalized && normalized !== lower) {
      result.fixes.push({
        module: 'product_intake',
        record_type: 'product',
        record_id: recordId,
        issue_found: `Non-standard material: ${product.material}`,
        fix_applied: `Normalized to: ${normalized}`,
        prior_values: { material: product.material },
        new_values: { material: normalized },
        confidence_after: 0.98,
        fix_level: 1,
        audit_note: 'Safe material normalization',
        was_applied: false, // Set by applyLevel1Fixes
      });
      moduleResult.fixes_applied++;
      // Counter updated by applyLevel1Fixes
    }
  }

  // Normalize grade
  if (product.grade) {
    const lower = product.grade.toLowerCase();
    const normalized = config.grade_normalize[lower];
    if (normalized && normalized !== lower) {
      result.fixes.push({
        module: 'product_intake',
        record_type: 'product',
        record_id: recordId,
        issue_found: `Non-standard grade: ${product.grade}`,
        fix_applied: `Normalized to: ${normalized}`,
        prior_values: { grade: product.grade },
        new_values: { grade: normalized },
        confidence_after: 0.98,
        fix_level: 1,
        audit_note: 'Safe grade normalization',
        was_applied: false, // Set by applyLevel1Fixes
      });
      moduleResult.fixes_applied++;
      // Counter updated by applyLevel1Fixes
    }
  }
}

function auditProductMatching(
  matches: MatchRecord[],
  config: QAConfig,
  result: QAAuditResult
): void {
  if (matches.length === 0) return;

  const moduleResult: QAModuleResult = {
    module: 'product_matching',
    records_checked: 0,
    issues_found: 0,
    fixes_applied: 0,
    fixes_skipped: 0,
    review_items_created: 0,
    blocked_items: 0,
    notes: [],
  };

  for (const match of matches) {
    moduleResult.records_checked++;
    result.summary.records_audited++;

    const conflicts = match.conflicting_fields || [];
    const matched = match.matched_fields || [];

    // Check for false exact match
    if (match.match_result === 'exact_match') {
      const criticalConflicts = conflicts.filter(f => 
        ['size', 'units_per_box', 'boxes_per_case', 'grade', 'thickness'].includes(f)
      );
      
      if (criticalConflicts.length > 0) {
        moduleResult.issues_found++;
        result.summary.issues_found++;
        
        result.fixes.push({
          module: 'product_matching',
          record_type: 'match',
          record_id: match.incoming_supplier_product_id,
          issue_found: `False exact match - conflicts in: ${criticalConflicts.join(', ')}`,
          fix_applied: 'Downgraded to likely_match',
          prior_values: { match_result: 'exact_match', match_confidence: match.match_confidence },
          new_values: { match_result: 'likely_match', match_confidence: Math.min(match.match_confidence, 0.75) },
          confidence_before: match.match_confidence,
          confidence_after: Math.min(match.match_confidence, 0.75),
          fix_level: 1,
          audit_note: `Critical conflicts: ${criticalConflicts.join(', ')}`,
          was_applied: false, // Set by applyLevel1Fixes
        });
        moduleResult.fixes_applied++;
        // Counter updated by applyLevel1Fixes
      }
    }

    // Check confidence justification
    if (match.match_confidence > 0.90 && matched.length < 5) {
      moduleResult.issues_found++;
      result.summary.issues_found++;
      
      result.fixes.push({
        module: 'product_matching',
        record_type: 'match',
        record_id: match.incoming_supplier_product_id,
        issue_found: `Confidence ${match.match_confidence} not justified by ${matched.length} matched fields`,
        fix_applied: 'Downgraded confidence',
        prior_values: { match_confidence: match.match_confidence },
        new_values: { match_confidence: 0.80 },
        confidence_before: match.match_confidence,
        confidence_after: 0.80,
        fix_level: 1,
        audit_note: 'Insufficient matched fields for high confidence',
        was_applied: false, // Set by applyLevel1Fixes
      });
      moduleResult.fixes_applied++;
      // Counter updated by applyLevel1Fixes
    }

    // Check for critical conflicts that should block
    if (conflicts.includes('manufacturer_part_number') && conflicts.includes('upc')) {
      result.blocked_actions.push({
        module: 'product_matching',
        record_type: 'match',
        record_id: match.incoming_supplier_product_id,
        reason_blocked: 'MPN and UPC both conflict - cannot be same product',
        severity: 'high',
      });
      moduleResult.blocked_items++;
      result.summary.items_blocked++;
      moduleResult.issues_found++;
      result.summary.issues_found++;
    }

    // Ambiguous matches to review
    if (match.match_confidence > 0.50 && match.match_confidence < config.min_confidence_auto_fix) {
      result.review_items.push({
        module: 'product_matching',
        record_type: 'match',
        record_id: match.incoming_supplier_product_id,
        issue_category: 'ambiguous_match',
        issue_summary: `Match confidence ${Math.round(match.match_confidence * 100)}% - manual verification needed`,
        recommended_action: 'VERIFY - Confirm products are equivalent',
        priority: 'medium',
      });
      moduleResult.review_items_created++;
      result.summary.items_sent_to_review++;
    }
  }

  result.module_results.push(moduleResult);
}

function auditCompetitivePricing(
  recommendations: PricingRecord[],
  config: QAConfig,
  result: QAAuditResult
): void {
  if (recommendations.length === 0) return;

  const moduleResult: QAModuleResult = {
    module: 'competitive_pricing',
    records_checked: 0,
    issues_found: 0,
    fixes_applied: 0,
    fixes_skipped: 0,
    review_items_created: 0,
    blocked_items: 0,
    notes: [],
  };

  for (const rec of recommendations) {
    moduleResult.records_checked++;
    result.summary.records_audited++;

    const issues: string[] = [];

    // Margin floor check
    const margin = rec.estimated_margin_percent_after_change;
    if (margin !== undefined && margin < config.min_margin_percent) {
      issues.push(`Margin ${Math.round(margin * 100)}% below floor`);
      result.blocked_actions.push({
        module: 'competitive_pricing',
        record_type: 'pricing',
        record_id: rec.canonical_product_id,
        reason_blocked: `Margin ${Math.round(margin * 100)}% below floor ${Math.round(config.min_margin_percent * 100)}%`,
        severity: 'high',
      });
      moduleResult.blocked_items++;
      result.summary.items_blocked++;
      moduleResult.issues_found++;
      result.summary.issues_found++;
      continue;
    }

    // MAP check
    if (rec.map_price && rec.recommended_price && rec.recommended_price < rec.map_price) {
      issues.push('Price violates MAP');
      result.blocked_actions.push({
        module: 'competitive_pricing',
        record_type: 'pricing',
        record_id: rec.canonical_product_id,
        reason_blocked: `Price $${rec.recommended_price} below MAP $${rec.map_price}`,
        severity: 'high',
      });
      moduleResult.blocked_items++;
      result.summary.items_blocked++;
      moduleResult.issues_found++;
      result.summary.issues_found++;
      continue;
    }

    // Price swing check
    const current = rec.current_price || 0;
    const recommended = rec.recommended_price || current;
    if (current > 0) {
      const swing = Math.abs(recommended - current) / current;
      if (swing > config.max_price_swing_without_review) {
        issues.push(`Price swing ${Math.round(swing * 100)}% exceeds threshold`);
        result.fixes.push({
          module: 'competitive_pricing',
          record_type: 'pricing',
          record_id: rec.canonical_product_id,
          issue_found: `Price swing ${Math.round(swing * 100)}% exceeds ${Math.round(config.max_price_swing_without_review * 100)}%`,
          fix_applied: 'Set auto_publish_eligible=false',
          prior_values: { auto_publish_eligible: rec.auto_publish_eligible },
          new_values: { auto_publish_eligible: false },
          confidence_after: rec.confidence ?? 0.80,
          fix_level: 1,
          audit_note: 'Large swing requires human review',
          was_applied: false, // Set by applyLevel1Fixes
        });
        moduleResult.fixes_applied++;
        // Counter updated by applyLevel1Fixes
      }
    }

    // Auto-publish safety
    if (rec.auto_publish_eligible) {
      const confidence = rec.confidence ?? 1.0;
      if (confidence < config.min_confidence_auto_publish) {
        issues.push(`Confidence ${Math.round(confidence * 100)}% below auto-publish threshold`);
        result.fixes.push({
          module: 'competitive_pricing',
          record_type: 'pricing',
          record_id: rec.canonical_product_id,
          issue_found: `Confidence ${Math.round(confidence * 100)}% below auto-publish threshold`,
          fix_applied: 'Blocked auto-publish',
          prior_values: { auto_publish_eligible: true },
          new_values: { auto_publish_eligible: false },
          confidence_after: confidence,
          fix_level: 1,
          audit_note: 'Safety check failed',
          was_applied: false, // Set by applyLevel1Fixes
        });
        moduleResult.fixes_applied++;
        // Counter updated by applyLevel1Fixes
      }
    }

    moduleResult.issues_found += issues.length;
    result.summary.issues_found += issues.length;

    // Create review item for questionable recommendations
    if (issues.length > 0 && !result.blocked_actions.find(b => b.record_id === rec.canonical_product_id)) {
      result.review_items.push({
        module: 'competitive_pricing',
        record_type: 'pricing',
        record_id: rec.canonical_product_id,
        issue_category: 'pricing_quality',
        issue_summary: issues.join('; '),
        recommended_action: 'VERIFY - Check pricing data before publishing',
        priority: issues.some(i => i.includes('margin') || i.includes('MAP')) ? 'high' : 'medium',
      });
      moduleResult.review_items_created++;
      result.summary.items_sent_to_review++;
    }
  }

  result.module_results.push(moduleResult);
}

function auditDailyPriceGuard(
  actions: ActionRecord[],
  config: QAConfig,
  result: QAAuditResult
): void {
  if (actions.length === 0) return;

  const moduleResult: QAModuleResult = {
    module: 'daily_price_guard',
    records_checked: 0,
    issues_found: 0,
    fixes_applied: 0,
    fixes_skipped: 0,
    review_items_created: 0,
    blocked_items: 0,
    notes: [],
  };

  const seen = new Map<string, ActionRecord>();

  for (const action of actions) {
    moduleResult.records_checked++;
    result.summary.records_audited++;

    // Duplicate check
    const key = `${action.product_id}|${action.action_type}`;
    if (seen.has(key)) {
      moduleResult.issues_found++;
      result.summary.issues_found++;
      result.fixes.push({
        module: 'daily_price_guard',
        record_type: 'action',
        record_id: action.product_id,
        issue_found: 'Duplicate action in queue',
        fix_applied: 'Merged with existing action',
        prior_values: {},
        new_values: {},
        confidence_after: 1.0,
        fix_level: 1,
        audit_note: 'Safe deduplication',
        was_applied: false, // Set by applyLevel1Fixes
      });
      moduleResult.fixes_applied++;
      // Counter updated by applyLevel1Fixes
      continue;
    }
    seen.set(key, action);

    // Auto-publish safety
    if (action.action_type === 'auto_publish') {
      const details = action.details || {};
      const confidence = (details.confidence as number) ?? 1.0;
      
      if (confidence < config.min_confidence_auto_publish) {
        moduleResult.issues_found++;
        result.summary.issues_found++;
        result.fixes.push({
          module: 'daily_price_guard',
          record_type: 'action',
          record_id: action.product_id,
          issue_found: `Confidence ${Math.round(confidence * 100)}% too low for auto-publish`,
          fix_applied: 'Moved to manual review',
          prior_values: { action_type: 'auto_publish' },
          new_values: { action_type: 'pricing_review' },
          confidence_after: confidence,
          fix_level: 1,
          audit_note: 'Auto-publish safety check failed',
          was_applied: false, // Set by applyLevel1Fixes
        });
        moduleResult.fixes_applied++;
        // Counter updated by applyLevel1Fixes
      }
    }

    // Missing reason
    if (!action.reason) {
      moduleResult.issues_found++;
      result.summary.issues_found++;
      result.review_items.push({
        module: 'daily_price_guard',
        record_type: 'action',
        record_id: action.product_id,
        issue_category: 'data_quality',
        issue_summary: 'Action queued without reason',
        recommended_action: 'INVESTIGATE - Why was this action created?',
        priority: 'low',
      });
      moduleResult.review_items_created++;
      result.summary.items_sent_to_review++;
    }
  }

  result.module_results.push(moduleResult);
}

// ============================================================================
// OPERATIONAL HEALTH AUDITS (not domain QA)
// ============================================================================

/**
 * Audit job queue health (operational, not domain QA)
 */
function auditOpsJobHealth(
  jobs: { status: string; job_type: string; blocked_reason?: string; id: string; created_at: string }[],
  result: QAAuditResult
): void {
  if (jobs.length === 0) return;

  const moduleResult: QAModuleResult = {
    module: 'ops_job_health',
    records_checked: jobs.length,
    issues_found: 0,
    fixes_applied: 0,
    fixes_skipped: 0,
    review_items_created: 0,
    blocked_items: 0,
    notes: ['Operational health check - not domain QA'],
  };

  result.summary.records_audited += jobs.length;

  // Check failed jobs
  const failedJobs = jobs.filter(j => j.status === 'failed');
  if (failedJobs.length > 5) {
    moduleResult.issues_found++;
    result.systemic_issues.push({
      issue: `High job failure rate: ${failedJobs.length} failed jobs`,
      impact: 'System reliability degraded',
      recommended_fix: 'Investigate failure patterns and fix root causes',
      occurrence_count: failedJobs.length,
      affected_module: 'ops_job_health',
    });
    result.summary.systemic_issues_found++;
  }

  // Record blocked jobs (these are NOT domain-blocked, they are job-level blocks)
  const blockedJobs = jobs.filter(j => j.status === 'blocked');
  moduleResult.blocked_items = blockedJobs.length;
  
  if (blockedJobs.length > 0) {
    moduleResult.notes.push(`${blockedJobs.length} jobs currently blocked`);
  }

  result.module_results.push(moduleResult);
}

/**
 * Audit review queue backlog (operational, not domain QA)
 */
function auditOpsReviewBacklog(
  reviews: { status: string; priority: string; source_table?: string; source_id?: string; issue_category: string; created_at: string; id: string }[],
  result: QAAuditResult
): void {
  if (reviews.length === 0) return;

  const moduleResult: QAModuleResult = {
    module: 'ops_review_backlog',
    records_checked: reviews.length,
    issues_found: 0,
    fixes_applied: 0,
    fixes_skipped: 0,
    review_items_created: 0,
    blocked_items: 0,
    notes: ['Operational health check - not domain QA'],
  };

  result.summary.records_audited += reviews.length;

  // Check for stale reviews
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const staleReviews = reviews.filter(r => new Date(r.created_at) < oneDayAgo);

  if (staleReviews.length > 10) {
    moduleResult.issues_found++;
    result.systemic_issues.push({
      issue: `${staleReviews.length} review items pending > 24 hours`,
      impact: 'Review backlog growing, decisions delayed',
      recommended_fix: 'Increase review capacity or adjust escalation threshold',
      occurrence_count: staleReviews.length,
      affected_module: 'ops_review_backlog',
    });
    result.summary.systemic_issues_found++;
  }

  // Check for duplicates (this is a SUGGESTED cleanup, not an applied fix)
  const reviewKeys = new Map<string, number>();
  for (const review of reviews) {
    const key = `${review.source_table}:${review.source_id}:${review.issue_category}`;
    reviewKeys.set(key, (reviewKeys.get(key) || 0) + 1);
  }

  let duplicateCount = 0;
  Array.from(reviewKeys.entries()).forEach(([, count]) => {
    if (count > 1) {
      duplicateCount++;
    }
  });

  if (duplicateCount > 0) {
    moduleResult.issues_found++;
    moduleResult.notes.push(`${duplicateCount} duplicate review item patterns detected - manual cleanup suggested`);
    // NOT counting as a fix since nothing is actually applied
  }

  result.module_results.push(moduleResult);
}

function runCrossChecks(
  data: { products: ProductRecord[] },
  config: QAConfig,
  result: QAAuditResult
): void {
  // Duplicate products by MPN
  const mpnSeen = new Map<string, string>();
  
  for (const p of data.products) {
    if (p.manufacturer_part_number) {
      const mpn = p.manufacturer_part_number.toLowerCase();
      const recordId = p.id || p.sku || 'unknown';
      
      if (mpnSeen.has(mpn)) {
        result.review_items.push({
          module: 'product_intake',
          record_type: 'product',
          record_id: recordId,
          issue_category: 'duplicate',
          issue_summary: `Duplicate MPN: ${mpn} (also on ${mpnSeen.get(mpn)})`,
          recommended_action: 'MERGE - Keep canonical version',
          priority: 'high',
        });
        result.summary.items_sent_to_review++;
        result.summary.issues_found++;
      } else {
        mpnSeen.set(mpn, recordId);
      }
    }
  }
}

function identifySystemicIssues(
  config: QAConfig,
  result: QAAuditResult
): void {
  const issuePatterns: Record<string, number> = {};

  for (const item of result.review_items) {
    issuePatterns[item.issue_category] = (issuePatterns[item.issue_category] || 0) + 1;
  }

  for (const fix of result.fixes) {
    if (fix.issue_found.toLowerCase().includes('confidence')) {
      issuePatterns['confidence_inflation'] = (issuePatterns['confidence_inflation'] || 0) + 1;
    }
    if (fix.issue_found.toLowerCase().includes('missing')) {
      issuePatterns['missing_data'] = (issuePatterns['missing_data'] || 0) + 1;
    }
  }

  const threshold = config.systemic_issue_threshold;
  
  for (const [pattern, count] of Object.entries(issuePatterns)) {
    if (count >= threshold) {
      const existing = result.systemic_issues.find(s => s.issue.includes(pattern));
      if (!existing) {
        result.systemic_issues.push({
          issue: `Recurring ${pattern} issue (${count} occurrences)`,
          impact: 'Degraded data quality across multiple records',
          recommended_fix: getSystemicFixRecommendation(pattern),
          occurrence_count: count,
        });
        result.summary.systemic_issues_found++;
      }
    }
  }
}

function getSystemicFixRecommendation(pattern: string): string {
  const recommendations: Record<string, string> = {
    'confidence_inflation': 'Review confidence scoring algorithm',
    'missing_data': 'Require mandatory fields in intake pipeline',
    'ambiguous_match': 'Tighten matching thresholds',
    'catalog_quality': 'Improve supplier data requirements',
    'pricing_quality': 'Increase competitor data validation',
    'duplicate': 'Add pre-intake duplicate detection',
  };
  return recommendations[pattern] || 'Investigate root cause and add validation';
}

function performSelfAudit(result: QAAuditResult): void {
  // 1. Check for guessing in fixes
  for (const fix of result.fixes) {
    if (fix.audit_note.includes('assumed') || fix.audit_note.includes('guessed') || fix.audit_note.includes('inferred')) {
      result.self_audit.guessed_anywhere = true;
      result.self_audit.validation_notes.push(`Guessing detected in fix: ${fix.issue_found}`);
    }
  }

  // 2. Check for unsafe automation (Level 2/3 fixes marked as applied)
  const unsafeApplied = result.fixes.filter(f => f.was_applied && f.fix_level > 1);
  if (unsafeApplied.length > 0) {
    result.self_audit.allowed_unsafe_automation = true;
    result.self_audit.validation_notes.push(`${unsafeApplied.length} Level 2/3 fixes marked as applied - requires review`);
  }

  // 3. Check blocked actions have reasons
  for (const blocked of result.blocked_actions) {
    if (!blocked.reason_blocked) {
      result.self_audit.validation_notes.push(`Blocked action without reason: ${blocked.record_id}`);
    }
  }

  // 4. Check for confidence downgrades missed
  // If we have matching issues but no confidence downgrades, flag it
  const matchIssues = result.review_items.filter(r => 
    r.issue_category === 'ambiguous_match' || 
    r.module === 'product_matching'
  );
  const confidenceDowngrades = result.fixes.filter(f => 
    f.issue_found.toLowerCase().includes('confidence')
  );
  if (matchIssues.length > 5 && confidenceDowngrades.length === 0) {
    result.self_audit.missed_confidence_downgrade = true;
    result.self_audit.validation_notes.push('Match issues found but no confidence downgrades applied');
  }

  // 5. Check for duplicate risk patterns
  const issuesByRecord = new Map<string, number>();
  for (const item of result.review_items) {
    const key = `${item.record_type}:${item.record_id}`;
    issuesByRecord.set(key, (issuesByRecord.get(key) || 0) + 1);
  }
  const duplicateRisks = Array.from(issuesByRecord.values()).filter(c => c > 2).length;
  if (duplicateRisks > 3) {
    result.self_audit.missed_duplicate_risk = true;
    result.self_audit.validation_notes.push(`${duplicateRisks} records have multiple issues - possible duplicate audit`);
  }

  // 6. Check for large review queue with no systemic issues
  if (result.review_items.length > 20 && result.systemic_issues.length === 0) {
    result.self_audit.missed_systemic_pattern = true;
    result.self_audit.validation_notes.push('Large review queue with no systemic issues identified');
  }

  // 7. Check for issue category patterns that should trigger systemic
  const categoryCount = new Map<string, number>();
  for (const item of result.review_items) {
    categoryCount.set(item.issue_category, (categoryCount.get(item.issue_category) || 0) + 1);
  }
  Array.from(categoryCount.entries()).forEach(([category, count]) => {
    if (count >= 5 && !result.systemic_issues.some(s => s.issue.includes(category))) {
      result.self_audit.missed_systemic_pattern = true;
      result.self_audit.validation_notes.push(`Repeated ${category} issues (${count}x) not flagged as systemic`);
    }
  });

  // 8. Validate fix metrics are accurate
  const actualApplied = result.fixes.filter(f => f.was_applied).length;
  if (actualApplied !== result.summary.safe_auto_fixes_applied) {
    result.self_audit.validation_notes.push(`Fix count mismatch: summary says ${result.summary.safe_auto_fixes_applied}, actual ${actualApplied}`);
  }

  // Final pass assessment
  result.self_audit.passed = 
    !result.self_audit.guessed_anywhere &&
    !result.self_audit.allowed_unsafe_automation &&
    !result.self_audit.missed_confidence_downgrade &&
    !result.self_audit.missed_duplicate_risk &&
    result.self_audit.validation_notes.length < 5;
}

function generateNextSteps(result: QAAuditResult): string[] {
  const steps: string[] = [];

  if (result.blocked_actions.length > 0) {
    steps.push(`Review ${result.blocked_actions.length} blocked actions immediately`);
  }

  const highPriority = result.review_items.filter(r => r.priority === 'high' || r.priority === 'critical');
  if (highPriority.length > 0) {
    steps.push(`Address ${highPriority.length} high-priority review items`);
  }

  if (result.systemic_issues.length > 0) {
    steps.push(`Investigate ${result.systemic_issues.length} systemic issues`);
  }

  if (result.summary.safe_auto_fixes_applied > 0) {
    steps.push(`${result.summary.safe_auto_fixes_applied} auto-fixes applied - verify in system`);
  }

  if (steps.length === 0) {
    steps.push('All checks passed - no immediate action required');
  }

  return steps;
}

/**
 * Mark Level 1 fixes as "logged" (NOT actually applied to source tables)
 * 
 * IMPORTANT: This function does NOT write to source tables.
 * It only marks fixes as logged so they will be persisted to fix_logs.
 * 
 * To actually apply fixes to source tables, you must implement:
 * - applySupplierFixes() for supplier table
 * - applyProductFixes() for products table  
 * - applyMatchFixes() for match results table
 * - applyPricingFixes() for pricing recommendations table
 */
async function applyLevel1Fixes(result: QAAuditResult): Promise<void> {
  let logged = 0;
  let skipped = 0;

  for (const fix of result.fixes) {
    if (fix.fix_level === 1 && !fix.was_applied && !fix.skipped_reason) {
      // Mark as "logged" - this will be persisted to fix_logs
      // This does NOT mean the fix was applied to the source table
      fix.was_applied = true;
      fix.audit_note += ' [LOGGED - source table NOT updated]';
      logged++;
    } else if (fix.fix_level > 1 || fix.skipped_reason) {
      skipped++;
    }
  }

  // Update summary with accurate counts
  result.summary.safe_auto_fixes_applied = logged;
  result.summary.safe_auto_fixes_skipped = skipped;

  if (logged > 0) {
    logger.warn('Fixes logged to fix_logs - NOTE: source tables were NOT updated', {
      logged_fixes: logged,
      skipped_fixes: skipped,
      message: 'Implement table-specific update functions to actually apply fixes',
    });
  }
}

/**
 * Count suggested fixes (dry_run or review_only mode)
 */
function countSuggestedFixes(result: QAAuditResult): void {
  const level1Fixes = result.fixes.filter(f => f.fix_level === 1 && !f.skipped_reason);
  result.summary.suggested_fixes = level1Fixes.length;
  result.summary.safe_auto_fixes_applied = 0; // Nothing applied in these modes
}
