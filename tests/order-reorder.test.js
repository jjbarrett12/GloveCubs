/**
 * Reorder preview / selection resolution (lib/order-reorder.js).
 * Run: node --test tests/order-reorder.test.js
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildReorderPreviews, resolveReorderSelections } = require('../lib/order-reorder');

const A = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const GONE = '99999999-9999-4999-8999-999999999999';

describe('order-reorder', () => {
  it('resolveReorderSelections: empty request adds all available lines', () => {
    const previews = [
      { product_id: A, canonical_product_id: A, size: null, status: 'available', quantity_ordered: 2 },
      { product_id: B, canonical_product_id: B, size: 'M', status: 'unavailable', quantity_ordered: 1 },
    ];
    const r = resolveReorderSelections(previews, undefined);
    assert.equal(r.ok, true);
    assert.equal(r.adds.length, 1);
    assert.equal(r.adds[0].quantity, 2);
  });

  it('resolveReorderSelections: rejects adding unavailable line explicitly', () => {
    const previews = [{ product_id: B, canonical_product_id: B, size: 'M', status: 'unavailable', name: 'X', reason: 'out' }];
    const r = resolveReorderSelections(previews, [{ product_id: B, canonical_product_id: B, size: 'M', quantity: 1 }]);
    assert.equal(r.ok, false);
  });

  const hasSupabase = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  (hasSupabase ? it : it.skip)('buildReorderPreviews: marks missing product unavailable', async () => {
    const productsService = {
      async getProductById() {
        return null;
      },
    };
    const lines = await buildReorderPreviews(
      [{ product_id: GONE, canonical_product_id: GONE, quantity: 1, size: null, unit_price: 10, product_name: 'Gone' }],
      { is_approved: true },
      null,
      { companies: [], customer_manufacturer_pricing: [] },
      productsService
    );
    assert.equal(lines[0].status, 'unavailable');
    assert.equal(lines[0].current_unit_price, null);
  });
});
