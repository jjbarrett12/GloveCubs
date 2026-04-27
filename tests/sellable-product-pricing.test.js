/**
 * Canonical sellable row → commerce dollars (fail fast on missing list).
 * Run: node --test tests/sellable-product-pricing.test.js
 */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  pricingDollarsFromSellableRow,
  MissingSellablePricingError,
} = require('../lib/sellable-product-pricing');

describe('sellable-product-pricing', () => {
  it('maps minors to dollars for list, bulk, cost', () => {
    const out = pricingDollarsFromSellableRow({
      catalog_product_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      list_price_minor: 1999,
      bulk_price_minor: 1500,
      unit_cost_minor: 800,
    });
    assert.equal(out.price, 19.99);
    assert.equal(out.list_price, 19.99);
    assert.equal(out.bulk_price, 15);
    assert.equal(out.cost, 8);
  });

  it('throws MissingSellablePricingError when list_price_minor missing', () => {
    assert.throws(
      () =>
        pricingDollarsFromSellableRow({
          catalog_product_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          list_price_minor: null,
        }),
      (e) => e instanceof MissingSellablePricingError,
    );
  });

  it('throws when sellable row is null', () => {
    assert.throws(() => pricingDollarsFromSellableRow(null), (e) => e instanceof MissingSellablePricingError);
  });
});
