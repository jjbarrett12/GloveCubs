'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  classifyEmail,
  classifyRecord,
  classifyProductSlug,
  classifySupplier,
  classifyLegacyProductSku,
  classifyRecommendationId,
  isLikelyTestData,
  shouldExcludeFromAdminKpi,
  filterLikelyTestRows,
  DEMO_EMAIL_EXACT,
} = require('../lib/contamination-heuristics');

describe('contamination-heuristics', () => {
  it('flags demo@company.com as definite/critical', () => {
    const c = classifyEmail('demo@company.com', 'user');
    assert.equal(c.flagged, true);
    assert.equal(c.confidence, 'definite');
    assert.equal(c.severity, 'critical');
    assert.equal(c.recommendedAction, 'quarantine_review');
  });

  it('flags @glovecubs-test.com as definite', () => {
    const c = classifyEmail('loadtest+123@glovecubs-test.com', 'user');
    assert.equal(c.flagged, true);
    assert.equal(c.confidence, 'definite');
  });

  it('flags loadtest and test-e2e email prefixes', () => {
    assert.equal(classifyEmail('loadtest@glovecubs.com').flagged, true);
    assert.equal(classifyEmail('test-e2e-99@example.com').flagged, true);
    assert.equal(classifyEmail('test-123@acme.com').flagged, true);
  });

  it('does not flag legitimate business emails', () => {
    const c = classifyEmail('buyer@bearfacilitysupply.com', 'user');
    assert.equal(c.flagged, false);
  });

  it('does not flag example.com in unit tests only when email is not a test prefix', () => {
    const c = classifyEmail('alice@example.com', 'user');
    assert.equal(c.flagged, true);
    assert.equal(c.confidence, 'high');
  });

  it('flags demo-product slug and sample supplier', () => {
    assert.equal(classifyProductSlug('demo-product-7').flagged, true);
    assert.equal(classifySupplier('sample-supplier', 'Sample Supplier').flagged, true);
  });

  it('flags seed SKU only as medium (false-positive guard)', () => {
    const c = classifyLegacyProductSku('GLV-GL-N105FX', null);
    assert.equal(c.flagged, true);
    assert.equal(c.confidence, 'medium');
    assert.equal(c.recommendedAction, 'manual_review');
  });

  it('does not flag non-seed SKU without placeholder image', () => {
    const c = classifyLegacyProductSku('ACME-NITRILE-100', 'https://cdn.example.com/a.jpg');
    assert.equal(c.flagged, false);
  });

  it('flags load-test quote row via classifyRecord', () => {
    const c = classifyRecord('quote_request', {
      email: 'loadtest+abc@glovecubs-test.com',
      company_name: 'LoadTest Company abc',
      notes: 'Load test quote submission - VU3',
    });
    assert.equal(c.flagged, true);
    assert.ok(c.reasons.length >= 2);
  });

  it('flags commerce truth smoke in notes', () => {
    const c = classifyRecord('inventory_adjustment', { notes: 'Commerce Truth Smoke adjustment' });
    assert.equal(c.flagged, true);
  });

  it('flags rec-duplicate-test recommendation outcomes', () => {
    assert.equal(classifyRecommendationId('rec-duplicate-test-12345').flagged, true);
  });

  it('shouldExcludeFromAdminKpi for definite patterns', () => {
    assert.equal(shouldExcludeFromAdminKpi({ email: DEMO_EMAIL_EXACT }, 'user'), true);
    assert.equal(shouldExcludeFromAdminKpi({ email: 'buyer@realco.com' }, 'user'), false);
  });

  it('filterLikelyTestRows removes flagged rows only', () => {
    const rows = [
      { email: 'demo@company.com' },
      { email: 'ops@realcustomer.com' },
    ];
    const kept = filterLikelyTestRows(rows, 'user');
    assert.equal(kept.length, 1);
    assert.equal(kept[0].email, 'ops@realcustomer.com');
  });

  it('isLikelyTestData matches classifyRecord.flagged', () => {
    const row = { email: 'test-e2e-1@example.com' };
    assert.equal(isLikelyTestData(row, 'user'), classifyRecord('user', row).flagged);
  });

  it('flags @test.local and matrix test emails', () => {
    assert.equal(classifyEmail('matrix3@test.local').flagged, true);
    assert.equal(classifyEmail('matrix3@test.local').confidence, 'high');
    assert.equal(shouldExcludeFromAdminKpi({ email: 'matrix3@test.local' }, 'quote_request'), true);
  });

  it('flags test-product slug and legacy company backfill', () => {
    assert.equal(classifyProductSlug('test-product').flagged, true);
    assert.equal(classifyRecord('company', { slug: 'legacy-no-company-backfill', trade_name: 'Legacy orders (no company)' }).flagged, true);
  });

  it('flags matrix/legacy order numbers but never auto-delete-safe with payment signals', () => {
    const matrix = classifyRecord('order', { order_number: 'MATRIX-R6-1779132825452', company_slug: 'legacy-no-company-backfill' });
    assert.equal(matrix.flagged, true);
    assert.equal(matrix.recommendedAction, 'exclude_from_kpi');

    const paid = classifyRecord('order', {
      order_number: 'MATRIX-R6-1779132825452',
      stripe_payment_intent_id: 'pi_123',
    });
    assert.equal(paid.flagged, true);
    assert.equal(paid.recommendedAction, 'manual_review');
    assert.equal(shouldExcludeFromAdminKpi({ order_number: 'MATRIX-R6-1', stripe_payment_intent_id: 'pi_123' }, 'order'), false);
  });

  it('preserves legitimate customer orders', () => {
    const c = classifyRecord('order', { order_number: 'GC-2026-0042', trade_name: 'Bear Facility Supply' });
    assert.equal(c.flagged, false);
  });
});

describe('contamination-report read-only guarantee', () => {
  it('contamination-report.mjs contains no write operations', () => {
    const src = fs.readFileSync(path.join(__dirname, '../scripts/contamination-report.mjs'), 'utf8');
    const lines = src.split('\n').filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'));
    const body = lines.join('\n');
    assert.doesNotMatch(body, /\.insert\s*\(/);
    assert.doesNotMatch(body, /\.update\s*\(/);
    assert.doesNotMatch(body, /\.delete\s*\(/);
    assert.doesNotMatch(body, /\.upsert\s*\(/);
  });

  it('contamination-report.mjs uses resilient orders fetch without notes column', () => {
    const src = fs.readFileSync(path.join(__dirname, '../scripts/contamination-report.mjs'), 'utf8');
    assert.match(src, /fetchOrdersForReport/);
    assert.doesNotMatch(src, /metadata, notes, created_at/);
  });

  it('contamination-report.sql contains no mutating statements', () => {
    const sql = fs.readFileSync(path.join(__dirname, '../scripts/sql/contamination-report.sql'), 'utf8');
    const withoutComments = sql
      .replace(/--[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(withoutComments, /\bDELETE\b/i);
    assert.doesNotMatch(withoutComments, /\bUPDATE\b/i);
    assert.doesNotMatch(withoutComments, /\bTRUNCATE\b/i);
    assert.doesNotMatch(withoutComments, /\bINSERT\s+INTO\b/i);
  });
});
