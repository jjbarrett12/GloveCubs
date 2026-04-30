/**
 * Variant-aware commerce: PO builder, reorder selection, regression grep.
 * Run: node --test tests/commerce-variant-paths.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { resolveReorderSelections } = require('../lib/order-reorder');

const PARENT = 'aaaaaaaa-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const VAR_A = '11111111-1111-4111-8111-111111111111';
const VAR_B = '22222222-2222-4222-8222-222222222222';

describe('resolveReorderSelections (catalog_variant_id)', () => {
  const basePreview = {
    product_id: PARENT,
    canonical_product_id: PARENT,
    size: 'L',
    quantity_ordered: 10,
    name: 'Glove',
    sku: 'N125',
    variant_sku: 'N125F-M',
    last_unit_price: 1,
    current_unit_price: 1,
    status: 'available',
    reason: null,
    price_change_percent: 0,
  };

  it('matches Pattern A line by catalog_variant_id (N125F-M style)', () => {
    const previews = [{ ...basePreview, catalog_variant_id: VAR_A, variant_sku: 'N125F-M' }];
    const r = resolveReorderSelections(previews, [
      { product_id: PARENT, catalog_variant_id: VAR_A, quantity: 3 },
    ]);
    assert.equal(r.ok, true);
    assert.equal(r.adds.length, 1);
    assert.equal(r.adds[0].preview.variant_sku, 'N125F-M');
    assert.equal(r.adds[0].quantity, 3);
  });

  it('matches Pattern B line by catalog_variant_id (numeric style)', () => {
    const previews = [{ ...basePreview, catalog_variant_id: VAR_B, variant_sku: '14404', size: null }];
    const r = resolveReorderSelections(previews, [
      { product_id: PARENT, catalog_variant_id: VAR_B, quantity: 2 },
    ]);
    assert.equal(r.ok, true);
    assert.equal(r.adds[0].preview.variant_sku, '14404');
  });

  it('falls back to product_id + size when catalog_variant_id omitted', () => {
    const previews = [{ ...basePreview, catalog_variant_id: VAR_A, size: 'M' }];
    const r = resolveReorderSelections(previews, [{ product_id: PARENT, size: 'M', quantity: 1 }]);
    assert.equal(r.ok, true);
  });
});

describe('buildPurchaseOrderLinesFromOrder (PO sku)', () => {
  const poPath = path.join(__dirname, '../lib/poLineBuilder.js');
  delete require.cache[poPath];
  const { buildPurchaseOrderLinesFromOrder } = require('../lib/poLineBuilder');

  /** PostgREST-style: final await on filter chain returns { data, error }. */
  function mockSupabaseFixed(cfg) {
    const offerChain = {
      select() {
        return offerChain;
      },
      eq() {
        return offerChain;
      },
      [Symbol.toStringTag]: 'PostgrestFilterBuilder',
    };
    offerChain.then = (resolve) => resolve({ data: cfg.offers, error: null });

    return {
      schema() {
        return {
          from(table) {
            if (table === 'catalog_products') {
              const c = {
                select() {
                  return c;
                },
                eq() {
                  return c;
                },
                maybeSingle: async () => ({ data: cfg.product, error: null }),
              };
              return c;
            }
            if (table === 'catalog_variants') {
              const c = {
                select() {
                  return c;
                },
                eq() {
                  return c;
                },
                maybeSingle: async () => ({ data: cfg.variant, error: null }),
              };
              return c;
            }
            throw new Error('unexpected table ' + table);
          },
        };
      },
      from(table) {
        if (table === 'supplier_offers') return offerChain;
        if (table === 'suppliers') {
          return {
            select() {
              return this;
            },
            in: async () => ({ data: cfg.suppliers || [{ id: 's1', settings: { manufacturer_id: 5 } }], error: null }),
          };
        }
        if (table === 'offer_trust_scores') {
          return {
            select() {
              return this;
            },
            in: async () => ({ data: [], error: null }),
          };
        }
        throw new Error('unexpected table ' + table);
      },
    };
  }

  it('uses catalog variant variant_sku on PO line when supplier_offers.sku differs', async () => {
    const sb = mockSupabaseFixed({
      product: { id: PARENT, manufacturer_id: 5 },
      variant: {
        id: VAR_A,
        variant_sku: 'N125F-M',
        catalog_product_id: PARENT,
        is_active: true,
      },
      offers: [
        {
          id: 'o1',
          sku: 'SUPPLIER-ONLY-SKU',
          price: 10,
          cost: 8,
          supplier_id: 's1',
          product_id: PARENT,
          product_name: 'X',
          is_active: true,
        },
      ],
    });
    const order = {
      id: 'ord-1',
      items: [
        {
          canonical_product_id: PARENT,
          product_id: PARENT,
          catalog_variant_id: VAR_A,
          variant_sku: 'N125F-M',
          quantity: 2,
          name: 'Glove',
        },
      ],
    };
    const res = await buildPurchaseOrderLinesFromOrder(order, { orderId: order.id, supabase: sb });
    assert.equal(res.ok, true);
    const lines = [...res.byManufacturer.values()].flat();
    assert.equal(lines.length, 1);
    assert.equal(lines[0].sku, 'N125F-M');
    assert.notEqual(lines[0].sku, 'SUPPLIER-ONLY-SKU');
  });

  it('blocks PO when order line lacks catalog_variant_id (no legacy flag)', async () => {
    const sb = mockSupabaseFixed({
      product: { id: PARENT, manufacturer_id: 5 },
      variant: null,
      offers: [
        {
          id: 'o1',
          sku: 'ONLY',
          price: 1,
          cost: 1,
          supplier_id: 's1',
          product_id: PARENT,
          is_active: true,
        },
      ],
    });
    const order = {
      id: 'ord-2',
      items: [
        {
          canonical_product_id: PARENT,
          product_id: PARENT,
          catalog_variant_id: null,
          quantity: 1,
        },
      ],
    };
    const res = await buildPurchaseOrderLinesFromOrder(order, { orderId: order.id, supabase: sb });
    assert.equal(res.ok, false);
    assert.ok(res.blocked_lines.some((b) => b.code === 'MISSING_CATALOG_VARIANT_FOR_PO'));
  });

  it('legacy PO path uses supplier offer sku when ctx.allowLegacyPoLinesWithoutCatalogVariant', async () => {
    const sb = mockSupabaseFixed({
      product: { id: PARENT, manufacturer_id: 5 },
      variant: null,
      offers: [
        {
          id: 'o1',
          sku: 'LEGACY-SUP',
          price: 2,
          cost: 1,
          supplier_id: 's1',
          product_id: PARENT,
          is_active: true,
        },
      ],
    });
    const order = {
      id: 'ord-3',
      items: [
        {
          canonical_product_id: PARENT,
          product_id: PARENT,
          catalog_variant_id: null,
          quantity: 1,
        },
      ],
    };
    const res = await buildPurchaseOrderLinesFromOrder(order, {
      orderId: order.id,
      supabase: sb,
      allowLegacyPoLinesWithoutCatalogVariant: true,
    });
    assert.equal(res.ok, true);
    const lines = [...res.byManufacturer.values()].flat();
    assert.equal(lines[0].sku, 'LEGACY-SUP');
  });
});

describe('commerce regression: no parent sku + hyphen + size concatenation in server/lib paths', () => {
  const needle = "sku + '-' + String(item.size)";
  const files = [
    path.join(__dirname, '../lib/order-reorder.js'),
    path.join(__dirname, '../lib/checkout-compute.js'),
    path.join(__dirname, '../server.js'),
    path.join(__dirname, '../public/js/app.js'),
    path.join(__dirname, '../public/js/admin-app.js'),
  ];
  for (const f of files) {
    it(`file ${path.basename(f)} does not contain ${needle}`, () => {
      const s = fs.readFileSync(f, 'utf8');
      assert.ok(!s.includes(needle), 'remove sku+size concatenation from ' + f);
    });
  }
});
