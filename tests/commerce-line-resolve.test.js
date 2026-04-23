/**
 * V2 line identity: catalog UUID only (resolveLineCatalogProductId).
 * No bigint maps, no live_product_id.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  resolveLineCatalogProductId,
  normalizeCanonicalUuidInput,
} = require('../lib/resolve-canonical-product-id');

describe('commerce line canonical (sync)', () => {
  it('prefers canonical_product_id when product_id is a legacy bigint', () => {
    const id = resolveLineCatalogProductId({
      product_id: 1,
      canonical_product_id: '11111111-2222-4333-8444-555555555555',
    });
    assert.strictEqual(id, '11111111-2222-4333-8444-555555555555');
  });

  it('uses UUID-shaped product_id when canonical_product_id is absent', () => {
    const id = resolveLineCatalogProductId({
      product_id: 'AAAAAAAA-BBBB-4CCC-8AAA-EEEEEEEEEEEE',
    });
    assert.strictEqual(id, 'aaaaaaaa-bbbb-4ccc-8aaa-eeeeeeeeeeee');
  });

  it('returns null when only non-UUID product_id (no bigint bridge)', () => {
    assert.strictEqual(resolveLineCatalogProductId({ product_id: 42 }), null);
    assert.strictEqual(resolveLineCatalogProductId({ product_id: 'SKU-123' }), null);
  });

  it('normalizeCanonicalUuidInput lowercases valid UUID', () => {
    const u = normalizeCanonicalUuidInput('AAAAAAAA-BBBB-4CCC-8AAA-EEEEEEEEEEEE');
    assert.strictEqual(u, 'aaaaaaaa-bbbb-4ccc-8aaa-eeeeeeeeeeee');
  });
});
