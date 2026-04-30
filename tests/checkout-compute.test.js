/**
 * Checkout money aggregation (shared with orders + quote).
 * Run: node --test tests/checkout-compute.test.js
 */

'use strict';

const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

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
const CAT = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const VAR = '11111111-1111-4111-8111-111111111111';
const lineWithVariant = (overrides) =>
  Object.assign(
    {
      product_id: CAT,
      quantity: 25,
      size: null,
      canonical_product_id: CAT,
      catalog_variant_id: VAR,
      variant_sku: 'V-G1',
    },
    overrides,
  );

const describeCompute = describe;

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
      cartItems: [lineWithVariant({ quantity: 25 })],
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
    const VAR99 = '22222222-2222-4222-8222-222222222222';
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
      cartItems: [
        {
          product_id: CAT99,
          quantity: 2,
          size: null,
          canonical_product_id: CAT99,
          catalog_variant_id: VAR99,
          variant_sku: 'V-M99',
        },
      ],
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

  it('returns 422 AMBIGUOUS_SELLABLE_FOR_VARIANT when getProductById throws', async () => {
    class AmbiguousSellableForVariantError extends Error {
      constructor() {
        super('Multiple active sellables');
        this.name = 'AmbiguousSellableForVariantError';
        this.code = 'AMBIGUOUS_SELLABLE_FOR_VARIANT';
      }
    }
    const productsService = {
      async getProductById(id, opts) {
        assert.equal(id, CAT);
        assert.equal(opts?.variant_sku, 'V-G1');
        assert.equal(opts?.catalog_variant_id, VAR);
        throw new AmbiguousSellableForVariantError();
      },
    };
    const r = await computeCheckoutMoneyFromCart({
      cartItems: [lineWithVariant({ quantity: 1 })],
      finalShippingAddress: addr,
      user: null,
      companyId: null,
      pricingContext: { companies: [], customer_manufacturer_pricing: [] },
      productsService,
    });
    assert.equal(r.ok, false);
    assert.equal(r.status, 422);
    assert.equal(r.body.code, 'AMBIGUOUS_SELLABLE_FOR_VARIANT');
  });

  it('passes variant_sku and catalog_variant_id into getProductById for pricing', async () => {
    let seenOpts;
    const productsService = {
      async getProductById(id, opts) {
        seenOpts = opts;
        if (id === CAT) {
          return { id: CAT, name: 'Glove', sku: 'G-1', price: 12, bulk_price: null, cost: 5, manufacturer_id: null, in_stock: true };
        }
        return null;
      },
    };
    const r = await computeCheckoutMoneyFromCart({
      cartItems: [lineWithVariant({ quantity: 25 })],
      finalShippingAddress: addr,
      user: null,
      companyId: null,
      pricingContext: { companies: [], customer_manufacturer_pricing: [] },
      productsService,
    });
    assert.equal(r.ok, true);
    assert.equal(seenOpts?.variant_sku, 'V-G1');
    assert.equal(seenOpts?.catalog_variant_id, VAR);
  });
});
