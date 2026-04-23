/**
 * Invoice + email read model: same shipping precedence (shipping vs shipping_cost).
 * Run: node --test tests/email-invoice-money-parity.test.js
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildOrderMoneyReadModel,
  computeInvoiceTotalsForDisplay,
} = require('../lib/order-invoice-totals');

describe('email-invoice money parity (shared read model)', () => {
  const items = [];

  it('prefers order.shipping over legacy shipping_cost for both invoice and read model', () => {
    const order = {
      subtotal: 100,
      shipping: 12,
      shipping_cost: 99,
      tax: 0,
      discount: 0,
      total: 112,
    };
    const inv = computeInvoiceTotalsForDisplay(order, items);
    const m = buildOrderMoneyReadModel(order, items);
    assert.equal(inv.shipping, 12);
    assert.equal(m.shipping, 12);
    assert.equal(inv.shipping, m.shipping);
  });

  it('falls back to shipping_cost when shipping absent', () => {
    const order = {
      subtotal: 50,
      shipping_cost: 18.5,
      tax: 0,
      discount: 0,
      total: 68.5,
    };
    const inv = computeInvoiceTotalsForDisplay(order, items);
    const m = buildOrderMoneyReadModel(order, items);
    assert.equal(inv.shipping, 18.5);
    assert.equal(m.shipping, 18.5);
    assert.equal(inv.orderTotal, 68.5);
    assert.equal(m.persistedTotal, 68.5);
  });
});
