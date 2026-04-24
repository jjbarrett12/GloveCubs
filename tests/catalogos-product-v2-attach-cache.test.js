/**
 * catalogosProductService: listing→v2 attach cache (no permanent null cache).
 * Run: node --test tests/catalogos-product-v2-attach-cache.test.js
 */

'use strict';

const path = require('path');
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const resolveMod = path.join(__dirname, '..', 'lib', 'resolve-catalog-v2-product-id.js');
const catSvc = path.join(__dirname, '..', 'services', 'catalogosProductService.js');

const LISTING_RETRY = 'aaaaaaaa-bbbb-4bbb-8bbb-111111111111';
const LISTING_CACHE = 'aaaaaaaa-bbbb-4bbb-8bbb-333333333333';
const V2 = 'bbbbbbbb-bbbb-4bbb-8bbb-222222222222';

describe('attachCatalogV2ProductId cache', () => {
  let origResolve;

  beforeEach(() => {
    origResolve = require.cache[resolveMod];
    delete require.cache[catSvc];
  });

  afterEach(() => {
    require.cache[resolveMod] = origResolve;
    delete require.cache[catSvc];
  });

  it('retries resolve after a failed mapping (no permanent null cache)', async () => {
    let calls = 0;
    require.cache[resolveMod] = {
      id: resolveMod,
      filename: resolveMod,
      loaded: true,
      exports: {
        resolveCatalogV2ProductId: async () => {
          calls += 1;
          if (calls === 1) {
            const e = new Error('simulated no v2 row');
            e.name = 'CatalogV2ProductMappingError';
            throw e;
          }
          return V2;
        },
        CatalogV2ProductMappingError: class CatalogV2ProductMappingError extends Error {},
      },
    };
    const { attachCatalogV2ProductId } = require('../services/catalogosProductService');
    const p = { id: LISTING_RETRY, sku: 'S1', name: 'Test Glove' };
    await attachCatalogV2ProductId(p);
    assert.equal(p.catalog_v2_product_id, undefined);
    assert.equal(calls, 1);
    await attachCatalogV2ProductId(p);
    assert.equal(p.catalog_v2_product_id, V2);
    assert.equal(calls, 2);
  });

  it('caches successful v2 mapping across repeated attach', async () => {
    let calls = 0;
    require.cache[resolveMod] = {
      id: resolveMod,
      filename: resolveMod,
      loaded: true,
      exports: {
        resolveCatalogV2ProductId: async () => {
          calls += 1;
          return V2;
        },
        CatalogV2ProductMappingError: class CatalogV2ProductMappingError extends Error {},
      },
    };
    const { attachCatalogV2ProductId } = require('../services/catalogosProductService');
    const p = { id: LISTING_CACHE, sku: 'S2', name: 'Other' };
    await attachCatalogV2ProductId(p);
    await attachCatalogV2ProductId(p);
    assert.equal(p.catalog_v2_product_id, V2);
    assert.equal(calls, 1);
  });
});
