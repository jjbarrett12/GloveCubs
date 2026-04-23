/**
 * Order invoice totals: shipping field alias + arithmetic vs order.total.
 * Run: node --test tests/order-invoice-totals.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  getOrderShippingAmount,
  buildOrderMoneyReadModel,
  computeInvoiceTotalsForDisplay,
  validateInvoiceTotalsMatchOrder,
} = require('../lib/order-invoice-totals');

describe('order-invoice-totals', () => {
  it('prefers order.shipping over shipping_cost', () => {
    assert.equal(getOrderShippingAmount({ shipping: 25, shipping_cost: 99 }), 25);
  });

  it('falls back to shipping_cost when shipping missing', () => {
    assert.equal(getOrderShippingAmount({ shipping_cost: 18.5 }), 18.5);
  });

  it('order with shipping > 0: invoice totals match order.total', () => {
    const order = {
      subtotal: 100,
      shipping: 25,
      tax: 8.25,
      discount: 0,
      total: 133.25,
      items: [{ quantity: 2, unit_price: 50, name: 'Gloves' }],
    };
    const totals = computeInvoiceTotalsForDisplay(order, order.items);
    assert.equal(totals.shipping, 25);
    assert.equal(totals.computedTotal, 133.25);
    assert.equal(totals.orderTotal, 133.25);
    const v = validateInvoiceTotalsMatchOrder(order, totals);
    assert.equal(v.ok, true);
  });

  it('detects mismatch between arithmetic and order.total', () => {
    const order = {
      subtotal: 100,
      shipping: 25,
      tax: 0,
      discount: 0,
      total: 999,
      items: [],
    };
    const totals = computeInvoiceTotalsForDisplay(order, order.items);
    const v = validateInvoiceTotalsMatchOrder(order, totals);
    assert.equal(v.ok, false);
    assert.ok(v.error && v.error.includes('999'));
  });

  it('includes discount in computed total', () => {
    const order = {
      subtotal: 200,
      shipping: 10,
      tax: 5,
      discount: 20,
      total: 195,
      items: [],
    };
    const totals = computeInvoiceTotalsForDisplay(order, order.items);
    assert.equal(totals.computedTotal, 195);
    const v = validateInvoiceTotalsMatchOrder(order, totals);
    assert.equal(v.ok, true);
  });

  it('buildOrderMoneyReadModel: persistedTotal null when order.total missing', () => {
    const order = { subtotal: 10, shipping: 2, tax: 0, discount: 0, items: [] };
    const m = buildOrderMoneyReadModel(order, []);
    assert.equal(m.computedTotal, 12);
    assert.equal(m.persistedTotal, null);
  });

  it('buildOrderMoneyReadModel: invoice still uses computed when total missing', () => {
    const order = { subtotal: 10, shipping: 2, tax: 0, discount: 0, items: [] };
    const inv = computeInvoiceTotalsForDisplay(order, []);
    assert.equal(inv.orderTotal, 12);
  });
});
