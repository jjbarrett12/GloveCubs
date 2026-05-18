/**
 * Phase 0B: commercial line identity + mandatory enforcement flag.
 * Run: node --test tests/commercial-line-identity.test.js
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const identityResolved = path.join(__dirname, '..', 'lib', 'commercial-line-identity.js');
const resolverResolved = path.join(__dirname, '..', 'lib', 'resolve-cart-catalog-variant.js');

const VARIANT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const PRODUCT_ID = '11111111-2222-4333-8444-555555555555';

describe('commercial-line-identity', () => {
  const origEnv = process.env.VARIANT_MANDATORY_ENFORCE;

  afterEach(() => {
    process.env.VARIANT_MANDATORY_ENFORCE = origEnv;
    delete require.cache[identityResolved];
    delete require.cache[resolverResolved];
  });

  it('isVariantMandatoryEnforceEnabled respects env', () => {
    process.env.VARIANT_MANDATORY_ENFORCE = '1';
    delete require.cache[identityResolved];
    const mod = require('../lib/commercial-line-identity');
    assert.equal(mod.isVariantMandatoryEnforceEnabled(), true);
    process.env.VARIANT_MANDATORY_ENFORCE = 'off';
    delete require.cache[identityResolved];
    assert.equal(require('../lib/commercial-line-identity').isVariantMandatoryEnforceEnabled(), false);
  });

  it('assertCommercialLineIdentity rejects missing variant_sku', async () => {
    const { assertCommercialLineIdentity } = require('../lib/commercial-line-identity');
    const supabase = {
      schema() {
        return {
          from() {
            return {
              select() {
                return {
                  eq() {
                    return { maybeSingle: async () => ({ data: null, error: null }) };
                  },
                };
              },
            };
          },
        };
      },
    };
    const r = await assertCommercialLineIdentity(supabase, {
      catalog_variant_id: VARIANT_ID,
      variant_sku: '',
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'MISSING_VARIANT_SKU');
  });

  it('resolveCatalogVariantForCommerceLine blocks inference when enforce on', async () => {
    process.env.VARIANT_MANDATORY_ENFORCE = '1';
    delete require.cache[identityResolved];
    delete require.cache[resolverResolved];
    const { resolveCatalogVariantForCommerceLine } = require('../lib/resolve-cart-catalog-variant');
    const supabase = {
      schema() {
        return {
          from() {
            return {
              select() {
                return {
                  eq() {
                    return { maybeSingle: async () => ({ data: null, error: null }) };
                  },
                };
              },
            };
          },
        };
      },
    };
    const r = await resolveCatalogVariantForCommerceLine(supabase, {
      canonical_product_id: PRODUCT_ID,
      size: 'l',
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'CATALOG_VARIANT_REQUIRED');
  });
});
