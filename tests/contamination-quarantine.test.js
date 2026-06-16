'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  CLEANUP_RISK,
  buildQuarantineCandidate,
  buildQuarantinePlanFromReport,
  quarantinePlanToCsv,
  extractBlockingSignals,
} = require('../lib/contamination-quarantine');

describe('contamination-quarantine planning', () => {
  it('classifies orders with payment signals as never_auto_delete', () => {
    const c = buildQuarantineCandidate({
      table: 'gc_commerce.orders',
      entityType: 'order',
      id: 'ord-1',
      classification: {
        confidence: 'definite',
        severity: 'high',
        reasons: ['order_number:MATRIX-* smoke/matrix fixture'],
        recommendedAction: 'manual_review',
      },
      preview: { order_number: 'MATRIX-R6-1', stripe_payment_intent_id: 'pi_123', total_minor: 1000, payment_method: 'card' },
    });
    assert.equal(c.cleanupRisk, CLEANUP_RISK.NEVER_AUTO_DELETE);
    assert.equal(c.requiresManualReview, true);
    assert.ok(c.blockingSignals.includes('stripe_payment_intent_id'));
  });

  it('classifies unpaid matrix orders as manual_review_required', () => {
    const c = buildQuarantineCandidate({
      table: 'gc_commerce.orders',
      entityType: 'order',
      id: 'ord-2',
      classification: {
        confidence: 'definite',
        severity: 'medium',
        reasons: ['order_number:LEGACY-*'],
        recommendedAction: 'exclude_from_kpi',
      },
      preview: { order_number: 'LEGACY-1779132801079', company_slug: 'legacy-no-company-backfill' },
    });
    assert.equal(c.cleanupRisk, CLEANUP_RISK.MANUAL_REVIEW_REQUIRED);
    assert.equal(c.requiresManualReview, true);
  });

  it('never auto-deletes medium-confidence rows', () => {
    const c = buildQuarantineCandidate({
      table: 'catalogos.suppliers',
      entityType: 'supplier',
      id: 'sup-1',
      classification: {
        confidence: 'medium',
        severity: 'medium',
        reasons: ['supplier:slug sample-supplier'],
        recommendedAction: 'manual_review',
      },
      preview: { slug: 'sample-supplier', name: 'Sample Supplier' },
    });
    assert.equal(c.cleanupRisk, CLEANUP_RISK.NEVER_AUTO_DELETE);
    assert.ok(c.blockingSignals.includes('medium_confidence'));
  });

  it('classifies sample-supplier as manual_review_required at high confidence', () => {
    const c = buildQuarantineCandidate({
      table: 'catalogos.suppliers',
      entityType: 'supplier',
      id: 'sup-2',
      classification: {
        confidence: 'definite',
        severity: 'medium',
        reasons: ['supplier:slug sample-supplier (migration seed)'],
        recommendedAction: 'archive_candidate',
      },
      preview: { slug: 'sample-supplier', name: 'Sample Supplier' },
    });
    assert.equal(c.cleanupRisk, CLEANUP_RISK.MANUAL_REVIEW_REQUIRED);
    assert.equal(c.proposedOperation, 'proposed_archive_after_fk_check');
  });

  it('classifies test-product as safe_to_archive_later after FK check', () => {
    const c = buildQuarantineCandidate({
      table: 'catalog_v2.catalog_products',
      entityType: 'catalog_product',
      id: 'prod-1',
      classification: {
        confidence: 'definite',
        severity: 'high',
        reasons: ['slug:test-product* (dev/test catalog fixture)'],
        recommendedAction: 'exclude_from_kpi',
      },
      preview: { slug: 'test-product', name: 'Test Product' },
    });
    assert.equal(c.cleanupRisk, CLEANUP_RISK.SAFE_TO_ARCHIVE_LATER);
    assert.equal(c.proposedOperation, 'proposed_archive_after_fk_check');
  });

  it('classifies users as never_auto_delete', () => {
    const c = buildQuarantineCandidate({
      table: 'public.users',
      entityType: 'user',
      id: 'user-1',
      classification: {
        confidence: 'definite',
        severity: 'critical',
        reasons: ['email:demo@company.com'],
        recommendedAction: 'quarantine_review',
      },
      preview: { email: 'demo@company.com' },
    });
    assert.equal(c.cleanupRisk, CLEANUP_RISK.NEVER_AUTO_DELETE);
  });

  it('builds plan from report with partial table warning', () => {
    const plan = buildQuarantinePlanFromReport({
      meta: { readOnly: true },
      tables: [
        {
          label: 'gc_commerce.orders',
          entityType: 'order',
          flagged: 12,
          samples: [
            {
              id: 'a',
              confidence: 'definite',
              severity: 'high',
              recommendedAction: 'manual_review',
              reasons: ['order_number:MATRIX-*'],
              preview: { order_number: 'MATRIX-1', stripe_payment_intent_id: 'pi_x' },
            },
          ],
        },
      ],
    });
    assert.equal(plan.summary.totalCandidates, 1);
    assert.equal(plan.meta.partialTables.length, 1);
    assert.equal(plan.meta.executesNothing, true);
    assert.equal(plan.candidates[0].cleanupRisk, CLEANUP_RISK.NEVER_AUTO_DELETE);
  });

  it('exports CSV with required columns', () => {
    const csv = quarantinePlanToCsv({
      candidates: [
        {
          table: 't',
          id: '1',
          entityType: 'order',
          entityLabel: 'MATRIX-1',
          confidence: 'definite',
          severity: 'high',
          cleanupRisk: CLEANUP_RISK.NEVER_AUTO_DELETE,
          proposedOperation: 'none_pending_review',
          requiresManualReview: true,
          recommendedAction: 'manual_review',
          blockingSignals: ['stripe_payment_intent_id'],
          reasons: ['order_number:MATRIX-*'],
        },
      ],
    });
    assert.match(csv, /cleanup_risk/);
    assert.match(csv, /never_auto_delete/);
  });

  it('extractBlockingSignals detects invoice fields', () => {
    const signals = extractBlockingSignals({ invoice_status: 'open', invoice_amount_paid: 500 });
    assert.ok(signals.includes('invoice_status'));
    assert.ok(signals.includes('invoice_amount_paid'));
  });
});

describe('contamination-quarantine read-only guarantee', () => {
  it('quarantine plan script contains no DB mutations', () => {
    const src = fs.readFileSync(path.join(__dirname, '../scripts/contamination-quarantine-plan.mjs'), 'utf8');
    const body = src
      .split('\n')
      .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
      .join('\n');
    assert.doesNotMatch(body, /\.insert\s*\(/);
    assert.doesNotMatch(body, /\.update\s*\(/);
    assert.doesNotMatch(body, /\.delete\s*\(/);
    assert.doesNotMatch(body, /require\(['"].*supabaseAdmin/);
  });

  it('quarantine review SQL contains no mutating statements', () => {
    const sql = fs.readFileSync(path.join(__dirname, '../scripts/sql/contamination-quarantine-review.sql'), 'utf8');
    const withoutComments = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(withoutComments, /\bDELETE\b/i);
    assert.doesNotMatch(withoutComments, /\bUPDATE\b/i);
    assert.doesNotMatch(withoutComments, /\bTRUNCATE\b/i);
  });
});
