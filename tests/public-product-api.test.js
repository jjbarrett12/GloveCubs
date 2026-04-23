'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  sanitizeProductForPublicApi,
  sanitizeProductsArrayForPublicApi,
  FORBIDDEN_PUBLIC_KEYS,
} = require('../lib/public-product-api');

describe('public-product-api', () => {
  const fullProduct = {
    id: 1,
    sku: 'GLV-1',
    name: 'Test Glove',
    brand: 'B',
    supplier_name: 'B',
    category: 'c',
    subcategory: null,
    description: 'd',
    material: 'nitrile',
    sizes: 'S,M',
    color: 'Blue',
    pack_qty: 100,
    case_qty: 1000,
    list_price: 29.99,
    price: 29.99,
    bulk_price: 24.99,
    cost: 12.5,
    image_url: 'https://example.com/i.jpg',
    images: [],
    in_stock: 1,
    quantity_on_hand: 50,
    featured: 0,
    manufacturer_id: 3,
    canonical_product_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    slug: 'test-glove',
    industry_tags: [],
    attributes: {},
    useCase: 'Healthcare',
  };

  it('anonymous-shaped response has no cost or margin keys', () => {
    const out = sanitizeProductForPublicApi(fullProduct, {
      isAdmin: false,
      isApprovedB2B: false,
      sellPrice: null,
    });
    for (const k of FORBIDDEN_PUBLIC_KEYS) {
      assert.strictEqual(out[k], undefined, `forbidden key leaked: ${k}`);
    }
    assert.strictEqual(out.cost, undefined);
    assert.strictEqual(out.list_price, 29.99);
    assert.strictEqual(out.price, 29.99);
    assert.strictEqual(out.bulk_price, undefined);
    assert.strictEqual(out.sell_price, undefined);
  });

  it('approved B2B sees bulk_price; sell_price when provided', () => {
    const out = sanitizeProductForPublicApi(fullProduct, {
      isAdmin: false,
      isApprovedB2B: true,
      sellPrice: 22.0,
    });
    assert.strictEqual(out.cost, undefined);
    assert.strictEqual(out.bulk_price, 24.99);
    assert.strictEqual(out.sell_price, 22);
  });

  it('list_price never uses cost when retail null', () => {
    const noRetail = { ...fullProduct, list_price: null, price: 12.5, cost: 12.5 };
    const out = sanitizeProductForPublicApi(noRetail, {
      isAdmin: false,
      isApprovedB2B: false,
      sellPrice: null,
    });
    assert.strictEqual(out.list_price, 0);
    assert.strictEqual(out.price, 0);
    assert.strictEqual(out.cost, undefined);
  });

  it('admin passthrough retains cost', () => {
    const out = sanitizeProductForPublicApi(fullProduct, {
      isAdmin: true,
      isApprovedB2B: false,
      sellPrice: null,
    });
    assert.strictEqual(out.cost, 12.5);
  });

  it('sanitizeProductsArrayForPublicApi preserves per-row sell_price', () => {
    const rows = [
      { ...fullProduct, id: 1, sell_price: 20 },
      { ...fullProduct, id: 2, sell_price: 21 },
    ];
    const out = sanitizeProductsArrayForPublicApi(rows, { isAdmin: false, isApprovedB2B: false });
    assert.strictEqual(out[0].sell_price, 20);
    assert.strictEqual(out[1].sell_price, 21);
    assert.strictEqual(out[0].cost, undefined);
  });
});
