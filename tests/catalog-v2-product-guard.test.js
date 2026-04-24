/**
 * catalog_v2 commerce guard (mocked Supabase).
 * Run: node --test tests/catalog-v2-product-guard.test.js
 */

'use strict';

const path = require('path');
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const adminResolved = path.join(__dirname, '..', 'lib', 'supabaseAdmin.js');
const guardResolved = path.join(__dirname, '..', 'lib', 'catalog-v2-product-guard.js');

const V2 = 'aaaaaaaa-bbbb-4ccc-8ddd-111111111111';
const FAKE = 'ffffffff-ffff-4fff-bfff-ffffffffffff';

function catalogProductsChain(data) {
  return {
    select() {
      return {
        eq() {
          return {
            maybeSingle: async () => ({ data, error: null }),
          };
        },
      };
    },
  };
}

describe('catalog-v2-product-guard', () => {
  let origAdmin;

  beforeEach(() => {
    origAdmin = require.cache[adminResolved];
  });

  afterEach(() => {
    require.cache[adminResolved] = origAdmin;
    delete require.cache[guardResolved];
  });

  it('rejects invalid UUID string with INVALID_PRODUCT_UUID', async () => {
    require.cache[adminResolved] = {
      id: adminResolved,
      filename: adminResolved,
      loaded: true,
      exports: { getSupabaseAdmin: () => ({}) },
    };
    delete require.cache[guardResolved];
    const { assertCatalogV2ProductIdForCommerce } = require('../lib/catalog-v2-product-guard');
    await assert.rejects(
      () => assertCatalogV2ProductIdForCommerce('not-a-uuid', 'test'),
      (e) => e.name === 'InvalidCatalogV2ProductIdError' && e.typedCode === 'INVALID_PRODUCT_UUID',
    );
  });

  it('rejects unknown v4 with NOT_FOUND_IN_CATALOG_V2 when neither schema has the row', async () => {
    require.cache[adminResolved] = {
      id: adminResolved,
      filename: adminResolved,
      loaded: true,
      exports: {
        getSupabaseAdmin: () => ({
          schema(name) {
            if (name === 'catalog_v2') {
              return { from: () => catalogProductsChain(null) };
            }
            return { from: () => ({}) };
          },
        }),
      },
    };
    delete require.cache[guardResolved];
    const { assertCatalogV2ProductIdForCommerce } = require('../lib/catalog-v2-product-guard');
    await assert.rejects(
      () => assertCatalogV2ProductIdForCommerce(FAKE, 'test'),
      (e) => e.name === 'InvalidCatalogV2ProductIdError' && e.typedCode === 'NOT_FOUND_IN_CATALOG_V2',
    );
  });

  it('accepts id present in catalog_v2.catalog_products', async () => {
    require.cache[adminResolved] = {
      id: adminResolved,
      filename: adminResolved,
      loaded: true,
      exports: {
        getSupabaseAdmin: () => ({
          schema(name) {
            if (name === 'catalog_v2') {
              return { from: () => catalogProductsChain({ id: V2 }) };
            }
            return { from: () => ({}) };
          },
        }),
      },
    };
    delete require.cache[guardResolved];
    const { assertCatalogV2ProductIdForCommerce } = require('../lib/catalog-v2-product-guard');
    const out = await assertCatalogV2ProductIdForCommerce(V2.toUpperCase(), 'test');
    assert.equal(out, V2);
  });
});
