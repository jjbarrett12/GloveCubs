/**
 * Phase 0E: checkout/cart pricing authority cutover.
 * Run: node --test tests/pricing-authority-checkout.test.js
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const checkoutResolved = path.join(__dirname, '..', 'lib', 'pricing-authority-checkout.js');
const authorityResolved = path.join(__dirname, '..', 'lib', 'pricing-authority-v2.js');
const commerceResolved = path.join(__dirname, '..', 'lib', 'commerce-pricing.js');

const VARIANT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const PRODUCT_ID = '11111111-2222-4333-8444-555555555555';

const product = { price: 100, bulk_price: 80, cost: 50, manufacturer_id: 1 };
const emptyCtx = { companies: [], customer_manufacturer_pricing: [] };

describe('pricing-authority-checkout', () => {
  const origCheckout = process.env.PRICING_AUTHORITY_V2_CHECKOUT;
  const origShadow = process.env.PRICING_AUTHORITY_V2_SHADOW;

  afterEach(() => {
    process.env.PRICING_AUTHORITY_V2_CHECKOUT = origCheckout;
    process.env.PRICING_AUTHORITY_V2_SHADOW = origShadow;
    delete require.cache[checkoutResolved];
    delete require.cache[authorityResolved];
    delete require.cache[commerceResolved];
  });

  it('uses legacy commerce-pricing when checkout flag is off', async () => {
    process.env.PRICING_AUTHORITY_V2_CHECKOUT = '0';
    delete require.cache[checkoutResolved];
    const { resolveCheckoutLineUnitPrice } = require('../lib/pricing-authority-checkout');
    const r = await resolveCheckoutLineUnitPrice({
      flow: 'test',
      user: null,
      companyId: null,
      product,
      quantity: 1,
      pricingContext: emptyCtx,
      catalog_variant_id: VARIANT_ID,
      variant_sku: 'SKU-M',
      catalog_product_id: PRODUCT_ID,
    });
    assert.equal(r.ok, true);
    assert.equal(r.unitPrice, 100);
    assert.equal(r.pricing_source, 'commerce-pricing.resolveLineUnitPriceForCheckout');
  });

  it('uses pricing authority when checkout flag is on', async () => {
    process.env.PRICING_AUTHORITY_V2_CHECKOUT = '1';
    delete require.cache[checkoutResolved];
    delete require.cache[authorityResolved];

    const adminPath = path.join(__dirname, '..', 'lib', 'supabaseAdmin.js');
    const origAdmin = require.cache[adminPath];
    require.cache[adminPath] = {
      id: adminPath,
      filename: adminPath,
      loaded: true,
      exports: {
        isSupabaseAdminConfigured: () => true,
        getSupabaseAdmin: () => ({
          schema() {
            return {
              from(table) {
                if (table === 'catalog_variants') {
                  return {
                    select() {
                      return {
                        eq() {
                          return {
                            maybeSingle: async () => ({
                              data: {
                                id: VARIANT_ID,
                                variant_sku: 'SKU-M',
                                catalog_product_id: PRODUCT_ID,
                                is_active: true,
                              },
                              error: null,
                            }),
                          };
                        },
                      };
                    },
                  };
                }
                throw new Error('unexpected table ' + table);
              },
            };
          },
          rpc(fn) {
            assert.equal(fn, 'gc_resolve_buyer_unit_price');
            return {
              data: {
                resolved_unit_price_major: 72.5,
                list_unit_price_major: 100,
                pricing_source: 'company_tier_off_list_v1',
                discount_percent: 10,
              },
              error: null,
            };
          },
        }),
      },
    };

    const { resolveCheckoutLineUnitPrice } = require('../lib/pricing-authority-checkout');
    const r = await resolveCheckoutLineUnitPrice({
      flow: 'checkout_compute',
      user: { is_approved: true, discount_tier: 'silver' },
      companyId: '22222222-3333-4444-8555-666666666666',
      product,
      quantity: 2,
      pricingContext: emptyCtx,
      catalog_variant_id: VARIANT_ID,
      variant_sku: 'SKU-M',
      catalog_product_id: PRODUCT_ID,
    });
    assert.equal(r.ok, true);
    assert.equal(r.unitPrice, 72.5);
    assert.equal(r.pricing_source, 'company_tier_off_list_v1');

    require.cache[adminPath] = origAdmin;
  });

  it('fail-closed when authority returns no price', async () => {
    process.env.PRICING_AUTHORITY_V2_CHECKOUT = '1';
    delete require.cache[checkoutResolved];
    delete require.cache[authorityResolved];

    const adminPath = path.join(__dirname, '..', 'lib', 'supabaseAdmin.js');
    const origAdmin = require.cache[adminPath];
    require.cache[adminPath] = {
      id: adminPath,
      filename: adminPath,
      loaded: true,
      exports: {
        isSupabaseAdminConfigured: () => true,
        getSupabaseAdmin: () => ({
          schema() {
            return {
              from() {
                return {
                  select() {
                    return {
                      eq() {
                        return {
                          maybeSingle: async () => ({
                            data: {
                              id: VARIANT_ID,
                              variant_sku: 'SKU-M',
                              catalog_product_id: PRODUCT_ID,
                              is_active: true,
                            },
                            error: null,
                          }),
                        };
                      },
                    };
                  },
                };
              },
            };
          },
          rpc() {
            return { data: { resolved_unit_price_major: null, list_unit_price_major: 100 }, error: null };
          },
        }),
      },
    };

    const { resolveCheckoutLineUnitPrice } = require('../lib/pricing-authority-checkout');
    const r = await resolveCheckoutLineUnitPrice({
      flow: 'cart_get',
      user: null,
      companyId: '22222222-3333-4444-8555-666666666666',
      product,
      quantity: 1,
      pricingContext: emptyCtx,
      catalog_variant_id: VARIANT_ID,
      variant_sku: 'SKU-M',
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'PRICE_NOT_AVAILABLE');

    require.cache[adminPath] = origAdmin;
  });
});
