/**
 * PO line offer selection (manufacturer ↔ supplier linkage).
 * Run: npm test (or node --test tests/po-line-builder.test.js)
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { selectOfferForPoLine, supplierSettingsManufacturerId } = require('../lib/poLineBuilder');

describe('poLineBuilder — supplierSettingsManufacturerId', () => {
  it('reads manufacturer_id from settings', () => {
    assert.strictEqual(supplierSettingsManufacturerId({ manufacturer_id: 12 }), 12);
    assert.strictEqual(supplierSettingsManufacturerId({ mfg_id: '7' }), 7);
    assert.strictEqual(supplierSettingsManufacturerId(null), null);
  });
});

describe('poLineBuilder — selectOfferForPoLine', () => {
  const mid = 5;

  it('picks offer whose supplier is linked to manufacturer', () => {
    const offers = [
      { id: 'a', supplier_id: 's1', sku: 'MFG-1' },
      { id: 'b', supplier_id: 's2', sku: 'OTHER' },
    ];
    const map = new Map([
      ['s1', { settings: { manufacturer_id: 5 } }],
      ['s2', { settings: { manufacturer_id: 99 } }],
    ]);
    const r = selectOfferForPoLine(offers, map, mid);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.offer.id, 'a');
  });

  it('rejects multiple offers when no supplier has manufacturer linkage', () => {
    const offers = [
      { id: 'a', supplier_id: 's1', sku: 'x' },
      { id: 'b', supplier_id: 's2', sku: 'y' },
    ];
    const map = new Map([
      ['s1', { settings: {} }],
      ['s2', { settings: {} }],
    ]);
    const r = selectOfferForPoLine(offers, map, mid);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.code, 'AMBIGUOUS_SUPPLIER_OFFER');
  });

  it('accepts single offer without linkage (with audit in production)', () => {
    const offers = [{ id: 'a', supplier_id: 's1', sku: 'ONLY-SKU' }];
    const map = new Map([['s1', { settings: {} }]]);
    const r = selectOfferForPoLine(offers, map, mid);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.offer.sku, 'ONLY-SKU');
  });

  it('rejects when linkage exists but none match manufacturer', () => {
    const offers = [{ id: 'a', supplier_id: 's1', sku: 'x' }];
    const map = new Map([['s1', { settings: { manufacturer_id: 99 } }]]);
    const r = selectOfferForPoLine(offers, map, mid);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.code, 'NO_SUPPLIER_OFFER_FOR_MANUFACTURER');
  });
});
