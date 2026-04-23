/**
 * Ingestion normalization & matching-adjacent scoring tests (Stage 2 / 3 helpers).
 * Run: node --test tests/ingestion-normalize.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');

const {
  normalizeBrand,
  normalizeColor,
  normalizeMaterial,
  inferCategory,
  createEmptyProduct,
} = require('../lib/ingestion/schema');

const {
  validateAndScore,
  checkDuplicate,
  validateBatch,
} = require('../lib/ingestion/validator');

describe('ingestion normalization (schema)', () => {
  it('normalizeBrand maps known aliases and strips trademark symbols', () => {
    assert.strictEqual(normalizeBrand('  mcr safety®  '), 'MCR Safety');
    assert.strictEqual(normalizeBrand('HOSPECO'), 'Hospeco');
    assert.strictEqual(normalizeBrand('Unknown Vendor Co'), 'Unknown Vendor Co');
    assert.strictEqual(normalizeBrand(null), null);
    assert.strictEqual(normalizeBrand(''), null);
  });

  it('normalizeColor maps grey to gray and accepts standard colors', () => {
    assert.strictEqual(normalizeColor('GREY'), 'gray');
    assert.strictEqual(normalizeColor('blue'), 'blue');
  });

  it('normalizeMaterial resolves aliases to controlled keys', () => {
    assert.strictEqual(normalizeMaterial('Nitrile exam glove'), 'nitrile');
    assert.strictEqual(normalizeMaterial('PVC coated'), 'vinyl');
    assert.strictEqual(normalizeMaterial('natural rubber'), 'latex');
  });

  it('inferCategory prefers reusable when text signals work gloves', () => {
    assert.strictEqual(
      inferCategory(null, null, 'Cut resistant work glove'),
      'reusable_work_gloves'
    );
    assert.strictEqual(
      inferCategory('nitrile', null, 'disposable exam'),
      'disposable_gloves'
    );
  });
});

describe('ingestion matching & confidence (validator)', () => {
  it('validateAndScore marks complete rows as pending when field confidence is high', () => {
    const p = createEmptyProduct();
    p.supplier_sku = 'SKU-1';
    p.canonical_title = 'Nitrile exam glove M';
    p.material = 'nitrile';
    p.supplier_cost = 12.5;
    p.category = 'disposable_gloves';
    p.pack_qty = 100;
    p.color = 'blue';
    p.primary_image = 'https://example.com/img.png';
    // Stage 2 should attach per-field confidence; without it, defaults keep overall < 0.7.
    p._confidence = {
      canonical_title: 1,
      category: 1,
      material: { confidence: 1 },
      pack_qty: { confidence: 1 },
      color: { confidence: 1 },
    };

    const r = validateAndScore(p);
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.status, 'pending');
    assert.ok(r.overallConfidence >= 0.7);
  });

  it('validateAndScore sends incomplete critical fields to review_required', () => {
    const p = createEmptyProduct();
    p.canonical_title = 'Something';
    p.supplier_cost = 10;
    // missing supplier_sku, material

    const r = validateAndScore(p);
    assert.strictEqual(r.status, 'review_required');
    assert.ok(r.flags.some((f) => f.type === 'missing_critical'));
  });

  it('checkDuplicate flags SKU present in existing set', async () => {
    const p = createEmptyProduct();
    p.supplier_sku = 'dup-1';
    const flag = await checkDuplicate(p, new Set(['DUP-1']));
    assert.ok(flag);
    assert.strictEqual(flag.type, 'possible_duplicate');
  });

  it('validateBatch detects duplicate SKUs within the batch', () => {
    const a = createEmptyProduct();
    a.supplier_sku = 'same';
    a.canonical_title = 'A';
    a.material = 'nitrile';
    a.supplier_cost = 1;
    a.category = 'disposable_gloves';
    a.pack_qty = 1;
    a.color = 'blue';
    a.primary_image = 'x';

    const b = { ...a, supplier_sku: 'same', canonical_title: 'B' };

    const { results, summary } = validateBatch([a, b]);
    assert.ok(
      results.some((r) =>
        r.flags.some(
          (f) => f.type === 'possible_duplicate' && /appears/.test(f.message)
        )
      )
    );
    assert.strictEqual(summary.total, 2);
  });
});
