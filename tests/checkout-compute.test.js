/**
 * Checkout money aggregation (shared with orders + quote).
 * Run: node --test tests/checkout-compute.test.js
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { computeCheckoutMoneyFromCart } = require('../lib/checkout-compute');

const addr = { state: 'NY', city: 'NYC', zip_code: '10001', address_line1: '1 Main', full_name: 'A' };
const CAT = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

const hasSupabaseForGuard = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const describeCompute = hasSupabaseForGuard ? describe : describe.skip;

describeCompute('checkout-compute', () => {
  it('computes subtotal, shipping, tax, total for simple cart', async () => {
    const productsService = {
      async getProductById(id) {
        if (id === CAT) {
          return { id: CAT, name: 'Glove', sku: 'G-1', price: 10, bulk_price: null, cost: 5, manufacturer_id: null, in_stock: true };
        }
        return null;
      },
    };
    const r = await computeCheckoutMoneyFromCart({
      cartItems: [{ product_id: CAT, quantity: 25, size: null, canonical_product_id: CAT }],
      finalShippingAddress: addr,
      user: null,
      companyId: null,
      pricingContext: { companies: [], customer_manufacturer_pricing: [] },
      productsService,
    });
    assert.equal(r.ok, true);
    assert.equal(r.value.subtotal, 250);
    assert.equal(r.value.discount, 0);
    assert.ok(typeof r.value.shipping === 'number');
    assert.equal(r.value.tax, 0);
    assert.equal(r.value.total, 250 + r.value.shipping);
    assert.equal(r.value.orderItems.length, 1);
    assert.equal(r.value.orderItems[0].price, 10);
  });

  it('company-linked pricing uses same pipeline as cart (margin, not guest list)', async () => {
    const CAT99 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const product = {
      id: CAT99,
      name: 'Margin SKU',
      sku: 'M-99',
      price: 200,
      bulk_price: 150,
      cost: 80,
      manufacturer_id: 3,
    };
    const productsService = {
      async getProductById(id) {
        return id === CAT99 ? product : null;
      },
    };
    const pricingContext = {
      companies: [{ id: 44, default_gross_margin_percent: 50 }],
      customer_manufacturer_pricing: [],
    };
    const user = { is_approved: true, discount_tier: 'bronze' };
    const r = await computeCheckoutMoneyFromCart({
      cartItems: [{ product_id: CAT99, quantity: 2, size: null, canonical_product_id: CAT99 }],
      finalShippingAddress: addr,
      user,
      companyId: 44,
      pricingContext,
      productsService,
    });
    assert.equal(r.ok, true);
    assert.notEqual(r.value.orderItems[0].price, 200);
    assert.notEqual(r.value.orderItems[0].price, 150);
  });
});
