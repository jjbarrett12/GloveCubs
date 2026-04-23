/**
 * V2 canonical product id helpers (no Supabase).
 * Run: node --test tests/resolve-canonical-product-id.test.js
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeCanonicalUuidInput,
  ensureCommerceLinesHaveCanonical,
  buildOrderItemRowsForInsert,
  MissingCanonicalProductIdError,
} = require('../lib/resolve-canonical-product-id');

const U = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

describe('resolve-canonical-product-id', () => {
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

  it('ensureCommerceLinesHaveCanonical normalizes product_id and canonical_product_id', async () => {
    const lines = [{ product_id: U, size: null }];
    await ensureCommerceLinesHaveCanonical(lines, 'test');
    assert.equal(lines[0].canonical_product_id, U);
    assert.equal(lines[0].product_id, U);
  });

  it('ensureCommerceLinesHaveCanonical rejects bigint-only lines', async () => {
    await assert.rejects(() => ensureCommerceLinesHaveCanonical([{ product_id: 5, size: null }], 't'), MissingCanonicalProductIdError);
  });

  it('buildOrderItemRowsForInsert persists canonical_product_id and legacy product_id 0', async () => {
    const rows = await buildOrderItemRowsForInsert(
      'ord-1',
      [{ canonical_product_id: U, quantity: 2, size: 'M', unit_price: 9 }],
      null,
      { requireCanonical: false },
    );
    assert.equal(rows[0].canonical_product_id, U);
    assert.equal(rows[0].product_id, 0);
    assert.equal(rows[0].quantity, 2);
  });
});
