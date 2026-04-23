/**
 * Checkout line pricing: company margin vs catalog bulk/list + tier.
 * Run: node --test tests/commerce-pricing.test.js
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveLineUnitPriceForCheckout,
  getTierDiscountPercentForUser,
} = require('../lib/commerce-pricing');

const emptyCtx = { companies: [], customer_manufacturer_pricing: [] };

const product = {
  price: 100,
  bulk_price: 80,
  cost: 50,
  manufacturer_id: 1,
};

const pricingContext = {
  companies: [{ id: 7, default_gross_margin_percent: 40 }],
  customer_manufacturer_pricing: [],
};

describe('commerce-pricing', () => {
  it('guest: list price, no tier', () => {
    const r = resolveLineUnitPriceForCheckout({
      user: null,
      companyId: null,
      product,
      quantity: 1,
      pricingContext: emptyCtx,
    });
    assert.equal(r.listUnitPrice, 100);
    assert.equal(r.catalogBulkUnitPrice, 80);
    assert.equal(r.baseBeforeTier, 100);
    assert.equal(r.unitPrice, 100);
    assert.equal(r.usedCompanyMarginPricing, false);
  });

  it('approved B2B without company: catalog bulk + tier', () => {
    const user = { is_approved: true, discount_tier: 'gold' };
    const r = resolveLineUnitPriceForCheckout({
      user,
      companyId: null,
      product,
      quantity: 1,
      pricingContext: emptyCtx,
    });
    assert.equal(r.baseBeforeTier, 80);
    assert.equal(r.tierPercentApplied, 15);
    assert.equal(r.unitPrice, 80 * 0.85);
  });

  it('company-linked: margin base from cost, then tier', () => {
    const user = { is_approved: true, discount_tier: 'silver' };
    const r = resolveLineUnitPriceForCheckout({
      user,
      companyId: 7,
      product,
      quantity: 1,
      pricingContext,
    });
    assert.equal(r.usedCompanyMarginPricing, true);
    assert.ok(Math.abs(r.baseBeforeTier - 50 / 0.6) < 1e-9);
    assert.equal(r.tierPercentApplied, 10);
    assert.ok(Math.abs(r.unitPrice - r.baseBeforeTier * 0.9) < 1e-9);
  });

  it('getTierDiscountPercentForUser', () => {
    assert.equal(getTierDiscountPercentForUser(null), 0);
    assert.equal(getTierDiscountPercentForUser({ is_approved: false, discount_tier: 'platinum' }), 0);
    assert.equal(getTierDiscountPercentForUser({ is_approved: true, discount_tier: 'platinum' }), 20);
    assert.equal(
      getTierDiscountPercentForUser({ is_approved: true, discount_tier: 'platinum' }, { platinum: 22 }),
      22
    );
    assert.equal(
      getTierDiscountPercentForUser({ is_approved: true, discount_tier: 'gold' }, { gold: 12 }),
      12
    );
  });
});
