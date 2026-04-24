/**
 * V2 canonical product id helpers.
 * Run: node --test tests/resolve-canonical-product-id.test.js
 */

'use strict';

const path = require('path');
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const LISTING = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const V2 = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';

function installResolveV2Stub() {
  const modPath = path.join(__dirname, '../lib/resolve-catalog-v2-product-id.js');
  const guardPath = path.join(__dirname, '../lib/catalog-v2-product-guard.js');
  const rcPath = path.join(__dirname, '../lib/resolve-canonical-product-id.js');
  delete require.cache[modPath];
  delete require.cache[guardPath];
  delete require.cache[rcPath];
  require.cache[guardPath] = {
    id: guardPath,
    filename: guardPath,
    loaded: true,
    exports: {
      assertCatalogV2ProductIdForCommerce: async (id) => {
        assert.equal(id, V2);
        return id;
      },
      InvalidCatalogV2ProductIdError: class InvalidCatalogV2ProductIdError extends Error {},
    },
  };
  require.cache[modPath] = {
    id: modPath,
    filename: modPath,
    loaded: true,
    exports: {
      resolveCatalogV2ProductId: async (id) => {
        assert.equal(id, LISTING);
        return V2;
      },
      CatalogV2ProductMappingError: class CatalogV2ProductMappingError extends Error {
        constructor(message, opts) {
          super(message);
          this.name = 'CatalogV2ProductMappingError';
          this.catalogosProductId = opts && opts.catalogosProductId;
        }
      },
    },
  };
}

describe('resolve-canonical-product-id', () => {
  let normalizeCanonicalUuidInput;
  let ensureCommerceLinesHaveCanonical;
  let buildOrderItemRowsForInsert;
  let MissingCanonicalProductIdError;

  beforeEach(() => {
    installResolveV2Stub();
    ({
      normalizeCanonicalUuidInput,
      ensureCommerceLinesHaveCanonical,
      buildOrderItemRowsForInsert,
      MissingCanonicalProductIdError,
    } = require('../lib/resolve-canonical-product-id'));
  });

  it('normalizeCanonicalUuidInput lowercases valid v4 UUID', () => {
    assert.equal(
      normalizeCanonicalUuidInput('AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE'),
      'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    );
  });

  it('normalizeCanonicalUuidInput rejects non-UUID', () => {
    assert.equal(normalizeCanonicalUuidInput('not-a-uuid'), null);
    assert.equal(normalizeCanonicalUuidInput(42), null);
  });

  it('ensureCommerceLinesHaveCanonical maps catalogos listing to catalog_v2 and listing_id', async () => {
    const lines = [{ product_id: LISTING, size: null }];
    await ensureCommerceLinesHaveCanonical(lines, 'test');
    assert.equal(lines[0].canonical_product_id, V2);
    assert.equal(lines[0].product_id, V2);
    assert.equal(lines[0].listing_id, LISTING);
  });

  it('ensureCommerceLinesHaveCanonical rejects bigint-only lines', async () => {
    await assert.rejects(() => ensureCommerceLinesHaveCanonical([{ product_id: 5, size: null }], 't'), MissingCanonicalProductIdError);
  });

  it('buildOrderItemRowsForInsert persists canonical_product_id and legacy product_id 0', async () => {
    const rows = await buildOrderItemRowsForInsert(
      'ord-1',
      [{ canonical_product_id: LISTING, quantity: 2, size: 'M', unit_price: 9 }],
      null,
      { requireCanonical: false },
    );
    assert.equal(rows[0].canonical_product_id, LISTING);
    assert.equal(rows[0].product_id, 0);
    assert.equal(rows[0].quantity, 2);
  });
});
