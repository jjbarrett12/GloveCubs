/**
 * Variant-aware sellable selection (lib/sellable-variant-resolution.js).
 * Run: node --test tests/sellable-variant-resolution.test.js
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  pickSellableForCheckoutLine,
  pickSellableForListing,
  AmbiguousSellableForVariantError,
} = require('../lib/sellable-variant-resolution');

describe('sellable-variant-resolution', () => {
  it('picks sellable whose sku matches variant_sku among S/M/L', () => {
    const rows = [
      { id: '1', sku: '14402', list_price_minor: 100 },
      { id: '2', sku: '14404', list_price_minor: 200 },
      { id: '3', sku: '14406', list_price_minor: 300 },
    ];
    const sp = pickSellableForCheckoutLine(rows, '14404');
    assert.equal(sp.sku, '14404');
    assert.equal(sp.id, '2');
  });

  it('prefers variant sellable over parent sku when variant matches', () => {
    const rows = [
      { id: 'p', sku: 'N125F', list_price_minor: 50 },
      { id: 'v', sku: '14404', list_price_minor: 200 },
    ];
    const sp = pickSellableForCheckoutLine(rows, '14404');
    assert.equal(sp.sku, '14404');
    assert.equal(sp.id, 'v');
  });

  it('falls back to single sellable when sku does not match but only one row', () => {
    const rows = [{ id: 'only', sku: 'N125F', list_price_minor: 99 }];
    const sp = pickSellableForCheckoutLine(rows, '14404');
    assert.equal(sp.sku, 'N125F');
  });

  it('throws AMBIGUOUS when multiple sellables and none match variant_sku', () => {
    const rows = [
      { id: 'a', sku: 'N125F', list_price_minor: 1 },
      { id: 'b', sku: 'N125G', list_price_minor: 2 },
    ];
    assert.throws(
      () => pickSellableForCheckoutLine(rows, '14404'),
      (e) => e instanceof AmbiguousSellableForVariantError && e.code === 'AMBIGUOUS_SELLABLE_FOR_VARIANT',
    );
  });

  it('pickSellableForListing: exactly one row', () => {
    assert.equal(pickSellableForListing([{ sku: 'Z' }]).sku, 'Z');
  });

  it('pickSellableForListing: multiple rows returns lexicographically first sku', () => {
    const sp = pickSellableForListing([
      { sku: 'B', id: 2 },
      { sku: 'A', id: 1 },
    ]);
    assert.equal(sp.sku, 'A');
  });
});
