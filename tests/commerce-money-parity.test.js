/**
 * Single money path: cart enrichment, checkout compute, quote vs order math, PaymentIntent cents.
 * Run: node --test tests/commerce-money-parity.test.js
 */

'use strict';

const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const commercePricing = require('../lib/commerce-pricing');

const guardPath = path.join(__dirname, '../lib/catalog-v2-product-guard.js');
const checkoutComputePath = path.join(__dirname, '../lib/checkout-compute.js');
delete require.cache[guardPath];
delete require.cache[checkoutComputePath];
require.cache[guardPath] = {
  id: guardPath,
  filename: guardPath,
  loaded: true,
  exports: {
    assertCatalogV2ProductIdForCommerce: async () => {},
    InvalidCatalogV2ProductIdError: class InvalidCatalogV2ProductIdError extends Error {},
  },
};
const { computeCheckoutMoneyFromCart } = require('../lib/checkout-compute');

const addr = { state: 'NY', city: 'NYC', zip_code: '10001', address_line1: '1 Main', full_name: 'A' };
const CAT42 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const CAT2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CAT1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

/** Mirrors GET /api/cart checkout_unit_price resolution. */
function cartCheckoutUnitPrice(user, companyId, product, pricingContext) {
  return commercePricing.resolveLineUnitPriceForCheckout({
    user,
    companyId,
    product,
    quantity: 1,
    pricingContext,
  }).unitPrice;
}

describe('commerce-money-parity', () => {
  it('company-linked B2B: cart unit price equals order line price from computeCheckoutMoneyFromCart', async () => {
    const product = {
      id: CAT42,
      name: 'Contract glove',
      sku: 'CG-1',
      price: 100,
      bulk_price: 70,
      cost: 40,
      manufacturer_id: 9,
    };
    const pricingContext = {
      companies: [{ id: 501, default_gross_margin_percent: 50 }],
      customer_manufacturer_pricing: [],
    };
    const user = { is_approved: true, discount_tier: 'gold' };
    const companyId = 501;

    const cup = cartCheckoutUnitPrice(user, companyId, product, pricingContext);
    const productsService = {
      async getProductById(id) {
        return id === CAT42 ? product : null;
      },
    };
    const money = await computeCheckoutMoneyFromCart({
      cartItems: [{ product_id: CAT42, quantity: 3, size: null, canonical_product_id: CAT42 }],
      finalShippingAddress: addr,
      user,
      companyId,
      pricingContext,
      productsService,
    });
    assert.equal(money.ok, true);
    assert.equal(money.value.orderItems.length, 1);
    assert.equal(
      money.value.orderItems[0].price,
      cup,
      'order row price must match cart checkout_unit_price resolver'
    );
    assert.equal(money.value.subtotal, cup * 3);
    assert.equal(money.value.orderItems[0].price === 70, false, 'must not silently use catalog bulk when company margin applies');
    assert.equal(money.value.orderItems[0].cost_at_order, 40, 'cost_at_order snapshots catalog cost for economics');
  });

  it('company margin base differs from bulk: still single resolved price', async () => {
    const product = {
      id: CAT2,
      name: 'Divergent',
      sku: 'D-1',
      price: 100,
      bulk_price: 80,
      cost: 50,
      manufacturer_id: 1,
    };
    const pricingContext = {
      companies: [{ id: 7, default_gross_margin_percent: 40 }],
      customer_manufacturer_pricing: [],
    };
    const user = { is_approved: true, discount_tier: 'silver' };
    const resolved = commercePricing.resolveLineUnitPriceForCheckout({
      user,
      companyId: 7,
      product,
      quantity: 1,
      pricingContext,
    });
    assert.equal(resolved.usedCompanyMarginPricing, true);
    assert.notEqual(
      Math.round(resolved.baseBeforeTier * 100) / 100,
      80,
      'margin sell base should not equal catalog bulk for this fixture'
    );
    const productsService = {
      async getProductById(id) {
        return id === CAT2 ? product : null;
      },
    };
    const money = await computeCheckoutMoneyFromCart({
      cartItems: [{ product_id: CAT2, quantity: 3, size: null, canonical_product_id: CAT2 }],
      finalShippingAddress: addr,
      user,
      companyId: 7,
      pricingContext,
      productsService,
    });
    assert.equal(money.ok, true);
    assert.equal(money.value.orderItems[0].price, resolved.unitPrice);
    assert.equal(money.value.subtotal, resolved.unitPrice * 3);
  });

  it('quote path parity: two computeCheckoutMoneyFromCart calls with same inputs yield identical totals', async () => {
    const product = {
      id: CAT1,
      name: 'G',
      sku: 'G-1',
      price: 55,
      bulk_price: null,
      cost: 10,
      manufacturer_id: null,
    };
    const productsService = {
      async getProductById(id) {
        return id === CAT1 ? product : null;
      },
    };
    const args = {
      cartItems: [{ product_id: CAT1, quantity: 4, size: null, canonical_product_id: CAT1 }],
      finalShippingAddress: addr,
      user: null,
      companyId: null,
      pricingContext: { companies: [], customer_manufacturer_pricing: [] },
      productsService,
    };
    const a = await computeCheckoutMoneyFromCart(args);
    const b = await computeCheckoutMoneyFromCart(args);
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    assert.equal(a.value.subtotal, b.value.subtotal);
    assert.equal(a.value.shipping, b.value.shipping);
    assert.equal(a.value.tax, b.value.tax);
    assert.equal(a.value.total, b.value.total);
  });

  it('PaymentIntent cents contract: server uses round(total * 100)', () => {
    const total = 88.07;
    const cents = Math.round(total * 100);
    assert.equal(cents, 8807);
    assert.equal(cents, Math.round(Number(total) * 100));
  });

  it('stale catalog: different product snapshots in two computes can change totals (document risk)', async () => {
    let priceVersion = 100;
    const productsService = {
      async getProductById() {
        return {
          id: CAT1,
          name: 'G',
          sku: 'G-1',
          price: priceVersion,
          bulk_price: null,
          cost: null,
          manufacturer_id: null,
        };
      },
    };
    const args = {
      cartItems: [{ product_id: CAT1, quantity: 3, size: null, canonical_product_id: CAT1 }],
      finalShippingAddress: addr,
      user: null,
      companyId: null,
      pricingContext: { companies: [], customer_manufacturer_pricing: [] },
      productsService,
    };
    const first = await computeCheckoutMoneyFromCart(args);
    priceVersion = 200;
    const second = await computeCheckoutMoneyFromCart(args);
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(first.value.subtotal, 300);
    assert.equal(second.value.subtotal, 600);
    assert.notEqual(first.value.total, second.value.total);
  });
});
