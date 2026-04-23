/**
 * Commerce shipping config + minimum order (FREE_SHIPPING_THRESHOLD, FLAT_SHIPPING_RATE, MIN_ORDER_AMOUNT).
 * Run: node --test tests/commerce-shipping.test.js
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

describe('commerce-shipping', () => {
  let mod;

  beforeEach(() => {
    delete process.env.FREE_SHIPPING_THRESHOLD;
    delete process.env.FLAT_SHIPPING_RATE;
    delete process.env.MIN_ORDER_AMOUNT;
    delete require.cache[require.resolve('../lib/commerce-shipping')];
    mod = require('../lib/commerce-shipping');
  });

  afterEach(() => {
    delete process.env.FREE_SHIPPING_THRESHOLD;
    delete process.env.FLAT_SHIPPING_RATE;
    delete process.env.MIN_ORDER_AMOUNT;
    delete require.cache[require.resolve('../lib/commerce-shipping')];
  });

  it('defaults: free at 500+, flat 25 below; min order 200', () => {
    const cfg = mod.getCommerceShippingConfig();
    assert.equal(cfg.freeShippingThreshold, 500);
    assert.equal(cfg.flatShippingRate, 25);
    assert.equal(cfg.minOrderAmount, 200);
    assert.equal(mod.computeShippingFromSubtotal(100, cfg), 25);
    assert.equal(mod.computeShippingFromSubtotal(499.99, cfg), 25);
    assert.equal(mod.computeShippingFromSubtotal(500, cfg), 0);
    assert.equal(mod.computeShippingFromSubtotal(501, cfg), 0);
    assert.equal(mod.validateMinimumOrder(199, cfg).ok, false);
    assert.equal(mod.validateMinimumOrder(200, cfg).ok, true);
    assert.equal(mod.validateMinimumOrder(150, cfg).shortBy, 50);
    assert.equal(mod.amountToFreeShipping(400, cfg), 100);
    assert.equal(mod.amountToFreeShipping(500, cfg), 0);
  });

  it('respects env overrides', () => {
    process.env.FREE_SHIPPING_THRESHOLD = '300';
    process.env.FLAT_SHIPPING_RATE = '15';
    process.env.MIN_ORDER_AMOUNT = '100';
    delete require.cache[require.resolve('../lib/commerce-shipping')];
    const m = require('../lib/commerce-shipping');
    const cfg = m.getCommerceShippingConfig();
    assert.equal(cfg.freeShippingThreshold, 300);
    assert.equal(cfg.flatShippingRate, 15);
    assert.equal(cfg.minOrderAmount, 100);
    assert.equal(m.computeShippingFromSubtotal(299, cfg), 15);
    assert.equal(m.computeShippingFromSubtotal(300, cfg), 0);
    assert.equal(m.validateMinimumOrder(99, cfg).ok, false);
    assert.equal(m.validateMinimumOrder(100, cfg).ok, true);
  });

  it('MIN_ORDER_AMOUNT=0 disables minimum', () => {
    process.env.MIN_ORDER_AMOUNT = '0';
    delete require.cache[require.resolve('../lib/commerce-shipping')];
    const m = require('../lib/commerce-shipping');
    const cfg = m.getCommerceShippingConfig();
    assert.equal(cfg.minOrderAmount, 0);
    assert.equal(m.validateMinimumOrder(1, cfg).ok, true);
    assert.equal(m.validateMinimumOrder(0, cfg).ok, true);
  });

  it('FREE_SHIPPING_THRESHOLD=0 means always free shipping', () => {
    process.env.FREE_SHIPPING_THRESHOLD = '0';
    process.env.FLAT_SHIPPING_RATE = '99';
    delete require.cache[require.resolve('../lib/commerce-shipping')];
    const m = require('../lib/commerce-shipping');
    const cfg = m.getCommerceShippingConfig();
    assert.equal(cfg.freeShippingThreshold, 0);
    assert.equal(m.computeShippingFromSubtotal(10, cfg), 0);
    assert.equal(m.amountToFreeShipping(10, cfg), 0);
  });

  it('negative env values clamp to 0 for thresholds and rates', () => {
    process.env.FREE_SHIPPING_THRESHOLD = '-10';
    process.env.FLAT_SHIPPING_RATE = '-5';
    process.env.MIN_ORDER_AMOUNT = '-1';
    delete require.cache[require.resolve('../lib/commerce-shipping')];
    const m = require('../lib/commerce-shipping');
    const cfg = m.getCommerceShippingConfig();
    assert.equal(cfg.freeShippingThreshold, 0);
    assert.equal(cfg.flatShippingRate, 0);
    assert.equal(cfg.minOrderAmount, 0);
    assert.equal(m.computeShippingFromSubtotal(50, cfg), 0);
    assert.equal(m.validateMinimumOrder(1, cfg).ok, true);
  });
});
