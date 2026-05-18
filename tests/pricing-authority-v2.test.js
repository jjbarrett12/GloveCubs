/**
 * Pricing Authority V2 + shadow compare (Phase 0A).
 * Run: node --test tests/pricing-authority-v2.test.js
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const adminResolved = path.join(__dirname, '..', 'lib', 'supabaseAdmin.js');
const authorityResolved = path.join(__dirname, '..', 'lib', 'pricing-authority-v2.js');
const shadowResolved = path.join(__dirname, '..', 'lib', 'pricing-authority-shadow.js');

const VARIANT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const PRODUCT_ID = '11111111-2222-4333-8444-555555555555';
const COMPANY_ID = '22222222-3333-4444-8555-666666666666';
const VARIANT_SKU = 'SKU-M';

const product = { price: 100, bulk_price: 80, cost: 50, manufacturer_id: 1 };
const emptyCtx = { companies: [], customer_manufacturer_pricing: [] };

function mockSupabaseForVariant({ rpcResult } = {}) {
  return {
    schema(name) {
      assert.equal(name, 'catalog_v2');
      return {
        from(table) {
          assert.equal(table, 'catalog_variants');
          return {
            select() {
              return {
                eq() {
                  return {
                    maybeSingle: async () => ({
                      data: {
                        id: VARIANT_ID,
                        variant_sku: VARIANT_SKU,
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
    rpc(fn, args) {
      assert.equal(fn, 'gc_resolve_buyer_unit_price');
      assert.equal(args.p_company_id, COMPANY_ID);
      assert.equal(args.p_catalog_variant_id, VARIANT_ID);
      return { data: rpcResult, error: null };
    },
  };
}

describe('pricing-authority-v2', () => {
  let origAdmin;
  let origAuthority;

  beforeEach(() => {
    origAdmin = require.cache[adminResolved];
    origAuthority = require.cache[authorityResolved];
    delete require.cache[authorityResolved];
    delete require.cache[shadowResolved];
  });

  afterEach(() => {
    require.cache[adminResolved] = origAdmin;
    require.cache[authorityResolved] = origAuthority;
    delete require.cache[authorityResolved];
    delete require.cache[shadowResolved];
  });

  it('guest path matches commerce-pricing list price', async () => {
    require.cache[adminResolved] = {
      id: adminResolved,
      filename: adminResolved,
      loaded: true,
      exports: {
        isSupabaseAdminConfigured: () => true,
        getSupabaseAdmin: () => mockSupabaseForVariant(),
      },
    };

    const { resolvePricingAuthorityV2 } = require('../lib/pricing-authority-v2');
    const r = await resolvePricingAuthorityV2({
      supabase: mockSupabaseForVariant(),
      catalog_variant_id: VARIANT_ID,
      variant_sku: VARIANT_SKU,
      quantity: 1,
      user: null,
      companyId: null,
      product,
      pricingContext: emptyCtx,
      flow: 'test',
    });

    assert.equal(r.ok, true);
    assert.equal(r.price_available, true);
    assert.equal(r.resolved_unit_price_major, 100);
    assert.equal(r.pricing_source, 'guest_sellable_list_v1');
    assert.equal(r.used_company_contract, false);
  });

  it('company path uses gc_resolve_buyer_unit_price RPC', async () => {
    const supabase = mockSupabaseForVariant({
      rpcResult: {
        catalog_variant_id: VARIANT_ID,
        catalog_product_id: PRODUCT_ID,
        resolved_unit_price_major: 72.5,
        list_unit_price_major: 100,
        pricing_source: 'company_tier_off_list_v1',
        discount_percent: 10,
        pricing_tier_code: 'silver',
        currency_code: 'USD',
        quantity: 1,
      },
    });

    const { resolvePricingAuthorityV2 } = require('../lib/pricing-authority-v2');
    const r = await resolvePricingAuthorityV2({
      supabase,
      catalog_variant_id: VARIANT_ID,
      variant_sku: VARIANT_SKU,
      quantity: 1,
      user: { is_approved: true, discount_tier: 'silver' },
      companyId: COMPANY_ID,
      flow: 'test',
    });

    assert.equal(r.ok, true);
    assert.equal(r.resolved_unit_price_major, 72.5);
    assert.equal(r.pricing_mode_applied, 'tier_off_list');
    assert.equal(r.used_company_contract, true);
    assert.equal(r.precedence_step, 2);
  });

  it('rejects variant_sku mismatch', async () => {
    const { validateVariantIdentity } = require('../lib/pricing-authority-v2');
    const r = await validateVariantIdentity(
      mockSupabaseForVariant(),
      VARIANT_ID,
      'WRONG-SKU',
    );
    assert.equal(r.ok, false);
    assert.equal(r.code, 'VARIANT_SKU_MISMATCH');
  });
});

describe('pricing-authority-shadow', () => {
  const origShadowEnv = process.env.PRICING_AUTHORITY_V2_SHADOW;
  let origAdmin;
  let origAuthority;
  let origShadow;
  let warnCalls;
  let origWarn;

  beforeEach(() => {
    origAdmin = require.cache[adminResolved];
    origAuthority = require.cache[authorityResolved];
    origShadow = require.cache[shadowResolved];
    warnCalls = [];
    origWarn = console.warn;
    console.warn = (...args) => {
      warnCalls.push(args);
      origWarn.apply(console, args);
    };
    delete require.cache[authorityResolved];
    delete require.cache[shadowResolved];
  });

  afterEach(() => {
    console.warn = origWarn;
    process.env.PRICING_AUTHORITY_V2_SHADOW = origShadowEnv;
    require.cache[adminResolved] = origAdmin;
    require.cache[authorityResolved] = origAuthority;
    require.cache[shadowResolved] = origShadow;
    delete require.cache[authorityResolved];
    delete require.cache[shadowResolved];
  });

  it('isPricingAuthorityV2ShadowEnabled respects env', () => {
    delete require.cache[shadowResolved];
    process.env.PRICING_AUTHORITY_V2_SHADOW = '1';
    const { isPricingAuthorityV2ShadowEnabled } = require('../lib/pricing-authority-shadow');
    assert.equal(isPricingAuthorityV2ShadowEnabled(), true);
    process.env.PRICING_AUTHORITY_V2_SHADOW = '0';
    delete require.cache[shadowResolved];
    const mod2 = require('../lib/pricing-authority-shadow');
    assert.equal(mod2.isPricingAuthorityV2ShadowEnabled(), false);
  });

  it('no-op when shadow flag is off', async () => {
    process.env.PRICING_AUTHORITY_V2_SHADOW = '0';
    require.cache[adminResolved] = {
      id: adminResolved,
      filename: adminResolved,
      loaded: true,
      exports: { isSupabaseAdminConfigured: () => true, getSupabaseAdmin: () => ({}) },
    };
    const { shadowComparePricingLine, SHADOW_TAG } = require('../lib/pricing-authority-shadow');
    await shadowComparePricingLine({
      flow: 'test',
      legacyUnitPriceMajor: 100,
      catalog_variant_id: VARIANT_ID,
      variant_sku: VARIANT_SKU,
      product,
    });
    assert.equal(
      warnCalls.filter((c) => c[0] === SHADOW_TAG).length,
      0,
    );
  });

  it('logs delta when legacy differs from authority', async () => {
    process.env.PRICING_AUTHORITY_V2_SHADOW = '1';
    require.cache[adminResolved] = {
      id: adminResolved,
      filename: adminResolved,
      loaded: true,
      exports: {
        isSupabaseAdminConfigured: () => true,
        getSupabaseAdmin: () => mockSupabaseForVariant(),
      },
    };

    const { shadowComparePricingLine, SHADOW_TAG } = require('../lib/pricing-authority-shadow');
    await shadowComparePricingLine({
      flow: 'cart_get',
      legacyUnitPriceMajor: 83.33,
      catalog_variant_id: VARIANT_ID,
      variant_sku: VARIANT_SKU,
      catalog_product_id: PRODUCT_ID,
      companyId: null,
      product,
      quantity: 1,
    });

    const shadowLogs = warnCalls.filter((c) => c[0] === SHADOW_TAG);
    assert.ok(shadowLogs.length >= 1);
    const payload = JSON.parse(shadowLogs[0][1]);
    assert.equal(payload.flow, 'cart_get');
    assert.ok(Math.abs(payload.delta_major) > 0.01);
    assert.equal(payload.legacy_pricing_source, 'commerce-pricing.resolveLineUnitPriceForCheckout');
  });
});
