'use strict';

/**
 * Quarantine planning (read-only classification). Does NOT mutate data.
 * Consumes contamination report samples and produces operator review candidates.
 */

const { orderHasFinancialSignals, KNOWN_DEMO_SUPPLIER_SLUG } = require('./contamination-heuristics');

/** @typedef {'safe_to_archive_later'|'manual_review_required'|'never_auto_delete'|'kpi_exclude_only'|'ignore_reference_data'} CleanupRisk */

/** @typedef {'none_pending_review'|'proposed_archive_after_fk_check'|'proposed_kpi_exclusion_only'|'proposed_operator_delete_after_approval'|'no_action_reference_data'} ProposedOperation */

const CLEANUP_RISK = {
  SAFE_TO_ARCHIVE_LATER: 'safe_to_archive_later',
  MANUAL_REVIEW_REQUIRED: 'manual_review_required',
  NEVER_AUTO_DELETE: 'never_auto_delete',
  KPI_EXCLUDE_ONLY: 'kpi_exclude_only',
  IGNORE_REFERENCE_DATA: 'ignore_reference_data',
};

const PROPOSED_OPERATION = {
  NONE_PENDING_REVIEW: 'none_pending_review',
  PROPOSED_ARCHIVE_AFTER_FK_CHECK: 'proposed_archive_after_fk_check',
  PROPOSED_KPI_EXCLUSION_ONLY: 'proposed_kpi_exclusion_only',
  PROPOSED_OPERATOR_DELETE_AFTER_APPROVAL: 'proposed_operator_delete_after_approval',
  NO_ACTION_REFERENCE_DATA: 'no_action_reference_data',
};

const REFERENCE_SUPPLIER_SLUGS = ['glovecubs-legacy-catalog'];

/**
 * @param {Record<string, unknown>|null|undefined} preview
 * @returns {string[]}
 */
function extractBlockingSignals(preview) {
  const p = preview || {};
  const signals = [];
  if (p.stripe_payment_intent_id) signals.push('stripe_payment_intent_id');
  if (p.payment_confirmed_at) signals.push('payment_confirmed_at');
  if (p.payment_method) signals.push('payment_method');
  if (p.invoice_status && String(p.invoice_status).toLowerCase() !== 'none' && String(p.invoice_status).toLowerCase() !== 'draft') {
    signals.push('invoice_status');
  }
  if (typeof p.invoice_amount_paid === 'number' && p.invoice_amount_paid > 0) signals.push('invoice_amount_paid');
  if (typeof p.total_minor === 'number' && p.total_minor > 0 && p.payment_method) signals.push('total_minor_with_payment_method');
  if (p.has_stripe === true) signals.push('has_stripe');
  if (orderHasFinancialSignals(p)) signals.push('order_financial_signals');
  return signals;
}

/**
 * @param {string} entityType
 * @param {Record<string, unknown>|null|undefined} preview
 * @returns {string}
 */
function buildEntityLabel(entityType, preview) {
  const p = preview || {};
  if (p.email) return String(p.email);
  if (p.order_number) return String(p.order_number);
  if (p.slug) return String(p.slug);
  if (p.trade_name) return String(p.trade_name);
  if (p.company_name) return String(p.company_name);
  if (p.name) return String(p.name);
  if (p.sku) return String(p.sku);
  if (p.po_number) return String(p.po_number);
  if (p.recommendation_id) return String(p.recommendation_id);
  return `${entityType}:${p.id ?? 'unknown'}`;
}

/**
 * @param {object} input
 * @param {string} input.table
 * @param {string} input.entityType
 * @param {string|null|undefined} input.id
 * @param {object} input.classification
 * @param {Record<string, unknown>|null|undefined} input.preview
 * @returns {object} Quarantine candidate
 */
function buildQuarantineCandidate({ table, entityType, id, classification, preview }) {
  const c = classification || {};
  const confidence = c.confidence || 'low';
  const severity = c.severity || 'low';
  const reasons = Array.isArray(c.reasons) ? c.reasons : [];
  const recommendedAction = c.recommendedAction || 'none';
  const blockingSignals = extractBlockingSignals(preview);
  const entityLabel = buildEntityLabel(entityType, preview);

  if (Array.isArray(reasons)) {
    if (reasons.some((r) => /financial|payment|invoice|stripe|never auto-delete/i.test(r))) {
      blockingSignals.push('classification_payment_signals');
    }
  }

  if (entityType === 'order' && preview?.order_number) {
    blockingSignals.push('commerce_order_record');
  }

  let cleanupRisk = CLEANUP_RISK.MANUAL_REVIEW_REQUIRED;
  let proposedOperation = PROPOSED_OPERATION.NONE_PENDING_REVIEW;
  let requiresManualReview = true;

  const slug = String(preview?.slug ?? preview?.company_slug ?? '').toLowerCase();

  if (REFERENCE_SUPPLIER_SLUGS.includes(slug)) {
    cleanupRisk = CLEANUP_RISK.IGNORE_REFERENCE_DATA;
    proposedOperation = PROPOSED_OPERATION.NO_ACTION_REFERENCE_DATA;
    requiresManualReview = false;
  } else if (confidence === 'medium') {
    cleanupRisk = CLEANUP_RISK.NEVER_AUTO_DELETE;
    proposedOperation = PROPOSED_OPERATION.NONE_PENDING_REVIEW;
    requiresManualReview = true;
    blockingSignals.push('medium_confidence');
  } else if (entityType === 'user' || entityType === 'admin_user') {
    cleanupRisk = CLEANUP_RISK.NEVER_AUTO_DELETE;
    proposedOperation = PROPOSED_OPERATION.PROPOSED_OPERATOR_DELETE_AFTER_APPROVAL;
    requiresManualReview = true;
    blockingSignals.push('identity_record');
  } else if (entityType === 'order') {
    const paymentBlock = blockingSignals.some(
      (s) =>
        s.includes('payment') ||
        s.includes('financial') ||
        s.includes('stripe') ||
        s.includes('invoice') ||
        s === 'classification_payment_signals',
    );
    if (paymentBlock) {
      cleanupRisk = CLEANUP_RISK.NEVER_AUTO_DELETE;
      proposedOperation = PROPOSED_OPERATION.NONE_PENDING_REVIEW;
    } else {
      cleanupRisk = CLEANUP_RISK.MANUAL_REVIEW_REQUIRED;
      proposedOperation = PROPOSED_OPERATION.PROPOSED_OPERATOR_DELETE_AFTER_APPROVAL;
    }
    requiresManualReview = true;
  } else if (entityType === 'contact_message') {
    cleanupRisk = CLEANUP_RISK.MANUAL_REVIEW_REQUIRED;
    proposedOperation = PROPOSED_OPERATION.PROPOSED_OPERATOR_DELETE_AFTER_APPROVAL;
    requiresManualReview = true;
    blockingSignals.push('may_contain_pii');
  } else if (entityType === 'supplier') {
    cleanupRisk = CLEANUP_RISK.MANUAL_REVIEW_REQUIRED;
    proposedOperation =
      slug === KNOWN_DEMO_SUPPLIER_SLUG
        ? PROPOSED_OPERATION.PROPOSED_ARCHIVE_AFTER_FK_CHECK
        : PROPOSED_OPERATION.NONE_PENDING_REVIEW;
    requiresManualReview = true;
    blockingSignals.push('supplier_fk_check_required');
  } else if (entityType === 'catalog_product' || entityType === 'product') {
    const isTestProduct = reasons.some((r) => r.includes('test-product') || r.includes('demo-product'));
    if (isTestProduct && confidence !== 'medium' && blockingSignals.length === 0) {
      cleanupRisk = CLEANUP_RISK.SAFE_TO_ARCHIVE_LATER;
      proposedOperation = PROPOSED_OPERATION.PROPOSED_ARCHIVE_AFTER_FK_CHECK;
    } else {
      cleanupRisk = CLEANUP_RISK.MANUAL_REVIEW_REQUIRED;
      proposedOperation = PROPOSED_OPERATION.PROPOSED_ARCHIVE_AFTER_FK_CHECK;
    }
    requiresManualReview = true;
    blockingSignals.push('catalog_fk_check_required');
  } else if (entityType === 'quote_request' || entityType === 'rfq') {
    cleanupRisk = CLEANUP_RISK.MANUAL_REVIEW_REQUIRED;
    proposedOperation = PROPOSED_OPERATION.PROPOSED_OPERATOR_DELETE_AFTER_APPROVAL;
    requiresManualReview = true;
    blockingSignals.push('lead_pipeline_record');
  } else if (entityType === 'company') {
    cleanupRisk = CLEANUP_RISK.MANUAL_REVIEW_REQUIRED;
    proposedOperation = PROPOSED_OPERATION.PROPOSED_OPERATOR_DELETE_AFTER_APPROVAL;
    requiresManualReview = true;
    blockingSignals.push('tenant_root_fk_check_required');
  } else if (entityType === 'inventory_adjustment' || entityType === 'purchase_order') {
    cleanupRisk = CLEANUP_RISK.MANUAL_REVIEW_REQUIRED;
    proposedOperation = PROPOSED_OPERATION.NONE_PENDING_REVIEW;
    requiresManualReview = true;
  } else if (entityType === 'recommendation_outcome') {
    cleanupRisk =
      confidence === 'medium' ? CLEANUP_RISK.NEVER_AUTO_DELETE : CLEANUP_RISK.SAFE_TO_ARCHIVE_LATER;
    proposedOperation = PROPOSED_OPERATION.PROPOSED_ARCHIVE_AFTER_FK_CHECK;
    requiresManualReview = true;
  } else if (recommendedAction === 'exclude_from_kpi') {
    cleanupRisk = CLEANUP_RISK.KPI_EXCLUDE_ONLY;
    proposedOperation = PROPOSED_OPERATION.PROPOSED_KPI_EXCLUSION_ONLY;
    requiresManualReview = false;
  } else if (recommendedAction === 'archive_candidate' && confidence !== 'medium') {
    cleanupRisk = CLEANUP_RISK.SAFE_TO_ARCHIVE_LATER;
    proposedOperation = PROPOSED_OPERATION.PROPOSED_ARCHIVE_AFTER_FK_CHECK;
    requiresManualReview = true;
  }

  if (recommendedAction === 'quarantine_review') {
    cleanupRisk = CLEANUP_RISK.NEVER_AUTO_DELETE;
    requiresManualReview = true;
  }

  return {
    table,
    id: id ?? null,
    entityType,
    entityLabel,
    confidence,
    severity,
    reasons,
    recommendedAction,
    cleanupRisk,
    blockingSignals: [...new Set(blockingSignals)],
    proposedOperation,
    requiresManualReview,
  };
}

/**
 * Build quarantine plan from contamination-report.json structure.
 * @param {object} report
 * @returns {object}
 */
function buildQuarantinePlanFromReport(report) {
  const tables = report?.tables || [];
  const candidates = [];
  const partialTables = [];

  for (const t of tables) {
    if (t.skipped || t.error) continue;
    const samples = t.samples || [];
    if (t.flagged > samples.length) {
      partialTables.push({
        table: t.label,
        flagged: t.flagged,
        sampled: samples.length,
        note: 'Plan includes report samples only — re-run report or increase GC_CONTAMINATION_SAMPLE before cleanup execution.',
      });
    }
    for (const s of samples) {
      candidates.push(
        buildQuarantineCandidate({
          table: t.label,
          entityType: t.entityType,
          id: s.id,
          classification: {
            confidence: s.confidence,
            severity: s.severity,
            reasons: s.reasons,
            recommendedAction: s.recommendedAction,
          },
          preview: s.preview,
        }),
      );
    }
  }

  const summary = {
    totalCandidates: candidates.length,
    byCleanupRisk: {},
    requiresManualReview: candidates.filter((c) => c.requiresManualReview).length,
    neverAutoDelete: candidates.filter((c) => c.cleanupRisk === CLEANUP_RISK.NEVER_AUTO_DELETE).length,
    safeToArchiveLater: candidates.filter((c) => c.cleanupRisk === CLEANUP_RISK.SAFE_TO_ARCHIVE_LATER).length,
    kpiExcludeOnly: candidates.filter((c) => c.cleanupRisk === CLEANUP_RISK.KPI_EXCLUDE_ONLY).length,
  };

  for (const c of candidates) {
    summary.byCleanupRisk[c.cleanupRisk] = (summary.byCleanupRisk[c.cleanupRisk] || 0) + 1;
  }

  return {
    meta: {
      readOnly: true,
      sourceReport: report?.meta || null,
      generatedAt: new Date().toISOString(),
      executesNothing: true,
      partialTables,
    },
    summary,
    candidates,
  };
}

/**
 * @param {object} plan
 * @returns {string}
 */
function quarantinePlanToCsv(plan) {
  const header =
    'table,id,entity_type,entity_label,confidence,severity,cleanup_risk,proposed_operation,requires_manual_review,recommended_action,blocking_signals,reasons';
  const lines = [header];
  for (const c of plan.candidates || []) {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    lines.push(
      [
        esc(c.table),
        esc(c.id),
        esc(c.entityType),
        esc(c.entityLabel),
        esc(c.confidence),
        esc(c.severity),
        esc(c.cleanupRisk),
        esc(c.proposedOperation),
        esc(c.requiresManualReview),
        esc(c.recommendedAction),
        esc((c.blockingSignals || []).join(' | ')),
        esc((c.reasons || []).join(' | ')),
      ].join(','),
    );
  }
  return lines.join('\n');
}

module.exports = {
  CLEANUP_RISK,
  PROPOSED_OPERATION,
  extractBlockingSignals,
  buildEntityLabel,
  buildQuarantineCandidate,
  buildQuarantinePlanFromReport,
  quarantinePlanToCsv,
};
