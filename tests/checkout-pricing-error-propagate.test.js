/**
 * computeCheckoutMoneyFromCart must not swallow MissingSellablePricingError from productsService.
 * Run: node --test tests/checkout-pricing-error-propagate.test.js
 */
'use strict';

const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { MissingSellablePricingError } = require('../services/catalogosProductService');

const guardPath = path.join(__dirname, '../lib/catalog-v2-product-guard.js');
const checkoutComputePath = path.join(__dirname, '../lib/checkout-compute.js');

describe('checkout pricing error propagate', () => {
  it('propagates MissingSellablePricingError from getProductById', async () => {
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
    const productsService = {
      async getProductById() {
        throw new MissingSellablePricingError('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
      },
    };
    await assert.rejects(
      () =>
        computeCheckoutMoneyFromCart({
          cartItems: [
            {
              product_id: CAT,
              quantity: 1,
              size: null,
              canonical_product_id: CAT,
              catalog_variant_id: VAR,
              variant_sku: 'V-X',
            },
          ],
          finalShippingAddress: addr,
          user: null,
          companyId: null,
          pricingContext: { companies: [], customer_manufacturer_pricing: [] },
          productsService,
        }),
      (e) => e instanceof MissingSellablePricingError,
    );
  });
});
