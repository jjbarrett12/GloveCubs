/**
 * Cart shipping-config: no silent defaults; policy gates threshold/min UI.
 * Run: node --test tests/commerce-shipping-config-client.test.js
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseCommerceShippingConfigResponse,
  cartShouldEnforceMinOrderBlock,
  cartShouldShowFreeShippingCountdown,
} = require('../lib/commerce-shipping-config-client');

describe('commerce-shipping-config-client', () => {
  it('parse: null on fetch failure / empty body', () => {
    assert.equal(parseCommerceShippingConfigResponse(null), null);
    assert.equal(parseCommerceShippingConfigResponse(undefined), null);
    assert.equal(parseCommerceShippingConfigResponse({}), null);
  });

  it('parse: null if any field missing or non-numeric', () => {
    assert.equal(
      parseCommerceShippingConfigResponse({
        free_shipping_threshold: 500,
        flat_shipping_rate: 25,
      }),
      null
    );
    assert.equal(
      parseCommerceShippingConfigResponse({
        free_shipping_threshold: 'x',
        flat_shipping_rate: 25,
        min_order_amount: 200,
      }),
      null
    );
  });

  it('parse: accepts valid server payload', () => {
    const c = parseCommerceShippingConfigResponse({
      free_shipping_threshold: 300,
      flat_shipping_rate: 15,
      min_order_amount: 100,
    });
    assert.deepEqual(c, {
      freeShippingThreshold: 300,
      flatShippingRate: 15,
      minOrderAmount: 100,
    });
  });

  it('policy: no min-order block when config not loaded', () => {
    assert.equal(cartShouldEnforceMinOrderBlock(false, { minOrderAmount: 500 }, 10), false);
    assert.equal(cartShouldEnforceMinOrderBlock(true, null, 10), false);
  });

  it('policy: min-order block only when loaded and below threshold', () => {
    assert.equal(cartShouldEnforceMinOrderBlock(true, { minOrderAmount: 200 }, 199), true);
    assert.equal(cartShouldEnforceMinOrderBlock(true, { minOrderAmount: 200 }, 200), false);
    assert.equal(cartShouldEnforceMinOrderBlock(true, { minOrderAmount: 0 }, 0), false);
  });

  it('policy: no free-shipping countdown when config not loaded', () => {
    assert.equal(cartShouldShowFreeShippingCountdown(false, { freeShippingThreshold: 500 }, 10), false);
    assert.equal(cartShouldShowFreeShippingCountdown(true, null, 10), false);
  });

  it('policy: countdown only when loaded and below free-shipping threshold', () => {
    assert.equal(cartShouldShowFreeShippingCountdown(true, { freeShippingThreshold: 500 }, 100), true);
    assert.equal(cartShouldShowFreeShippingCountdown(true, { freeShippingThreshold: 500 }, 500), false);
    assert.equal(cartShouldShowFreeShippingCountdown(true, { freeShippingThreshold: 0 }, 5), false);
  });
});
