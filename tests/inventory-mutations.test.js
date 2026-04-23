/**
 * Inventory mutations + canonical-first reads (mocked Supabase).
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const adminResolved = path.join(__dirname, '..', 'lib', 'supabaseAdmin.js');
const dataServiceResolved = path.join(__dirname, '..', 'services', 'dataService.js');
const inventoryResolved = path.join(__dirname, '..', 'lib', 'inventory.js');

const UUID_A = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const UUID_B = '11111111-2222-4333-8444-555555555555';
const ORDER_RESERVE = 'aaaaaaaa-bbbb-4ccc-8ddd-000000009001';
const ORDER_RELEASE = 'aaaaaaaa-bbbb-4ccc-8ddd-000000008002';
const ORDER_DEDUCT = 'aaaaaaaa-bbbb-4ccc-8ddd-000000007003';

describe('inventory mutations (mocked)', () => {
  let origAdmin;
  let origDataService;

  beforeEach(() => {
    origAdmin = require.cache[adminResolved];
    origDataService = require.cache[dataServiceResolved];
  });

  afterEach(() => {
    require.cache[adminResolved] = origAdmin;
    require.cache[dataServiceResolved] = origDataService;
    delete require.cache[inventoryResolved];
  });

  it('getStockForLineItem reads inventory by canonical_product_id only', async () => {
    const invByCanon = new Map([
      [
        UUID_A,
        {
          canonical_product_id: UUID_A,
          quantity_on_hand: 100,
          quantity_reserved: 20,
          incoming_quantity: 0,
          reorder_point: 0,
          bin_location: 'A1',
        },
      ],
    ]);

    require.cache[adminResolved] = {
      id: adminResolved,
      filename: adminResolved,
      loaded: true,
      exports: {
        getSupabaseAdmin: () => ({
          from(table) {
            if (table !== 'inventory') return {};
            return {
              select() {
                return {
                  eq(field, val) {
                    return {
                      maybeSingle: async () => {
                        if (field === 'canonical_product_id') {
                          return { data: invByCanon.get(val) || null, error: null };
                        }
                        return { data: null, error: null };
                      },
                    };
                  },
                };
              },
            };
          },
        }),
      },
    };
    delete require.cache[inventoryResolved];
    const inventory = require('../lib/inventory');
    const stock = await inventory.getStockForLineItem({
      canonical_product_id: UUID_A,
    });
    assert.strictEqual(stock.available_stock, 80);
    assert.strictEqual(stock.stock_on_hand, 100);
    assert.strictEqual(stock.canonical_product_id, UUID_A);
  });

  it('getStockHistory filters by canonical_product_id when option set', async () => {
    let capturedFilter = null;
    require.cache[adminResolved] = {
      id: adminResolved,
      filename: adminResolved,
      loaded: true,
      exports: {
        getSupabaseAdmin: () => ({
          from(table) {
            if (table !== 'stock_history') return {};
            const chain = {
              select() {
                return chain;
              },
              order() {
                return chain;
              },
              limit() {
                return chain;
              },
              eq(field, val) {
                capturedFilter = { field, val };
                return chain;
              },
              then(resolve) {
                resolve({ data: [{ id: 1, canonical_product_id: UUID_A }], error: null });
              },
            };
            return chain;
          },
        }),
      },
    };
    delete require.cache[inventoryResolved];
    const inventory = require('../lib/inventory');
    const rows = await inventory.getStockHistory(undefined, 50, { canonical_product_id: UUID_A });
    assert.strictEqual(capturedFilter.field, 'canonical_product_id');
    assert.strictEqual(capturedFilter.val, UUID_A);
    assert.strictEqual(rows.length, 1);
  });

  it('upsertInventory sets canonical_product_id from payload', async () => {
    let upserted = null;
    require.cache[adminResolved] = {
      id: adminResolved,
      filename: adminResolved,
      loaded: true,
      exports: {
        getSupabaseAdmin: () => ({
          from(table) {
            if (table !== 'inventory') return {};
            return {
              upsert(row, _opts) {
                upserted = row;
                return Promise.resolve({ error: null });
              },
            };
          },
        }),
      },
    };
    delete require.cache[dataServiceResolved];
    const dataService = require('../services/dataService');
    await dataService.upsertInventory(42, {
      quantity_on_hand: 7,
      canonical_product_id: UUID_B,
    });
    assert.strictEqual(upserted.canonical_product_id, UUID_B);
    assert.strictEqual(upserted.quantity_on_hand, 7);
  });

  it('reserveStockForOrder uses line canonical for availability and updates inventory', async () => {
    const orderId = ORDER_RESERVE;
    const orders = new Map([
      [
        orderId,
        {
          id: orderId,
          inventory_reserved_at: null,
          inventory_released_at: null,
          inventory_deducted_at: null,
        },
      ],
    ]);
    const inv = {
      canonical_product_id: UUID_A,
      quantity_on_hand: 50,
      quantity_reserved: 0,
      incoming_quantity: 0,
      reorder_point: 0,
      bin_location: '',
    };

    require.cache[adminResolved] = {
      id: adminResolved,
      filename: adminResolved,
      loaded: true,
      exports: {
        getSupabaseAdmin: () => ({
          schema(schemaName) {
            if (schemaName !== 'gc_commerce') return { from: () => ({}) };
            return {
              from(table) {
                if (table !== 'orders') return {};
                return {
                  select() {
                    return {
                      eq(_f, id) {
                        return {
                          maybeSingle: async () => ({
                            data: orders.get(id) || null,
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
          async rpc(name, args) {
            if (name === 'gc_reserve_stock_for_order_atomic') {
              const line = (args.p_items && args.p_items[0]) || {};
              inv.quantity_reserved = (inv.quantity_reserved ?? 0) + (line.quantity || 0);
              const o = orders.get(args.p_order_id);
              if (o) o.inventory_reserved_at = new Date().toISOString();
              return { data: { ok: true, skipped: false }, error: null };
            }
            return { data: null, error: { message: 'unknown rpc ' + name } };
          },
          from(table) {
            if (table === 'inventory') {
              return {
                select() {
                  return {
                    eq(field, val) {
                      return {
                        maybeSingle: async () => {
                          if (field === 'canonical_product_id' && val === UUID_A) {
                            return { data: { ...inv }, error: null };
                          }
                          if (field === 'id') {
                            return { data: null, error: null };
                          }
                          return { data: null, error: null };
                        },
                      };
                    },
                  };
                },
                insert: async () => ({ error: null }),
              };
            }
            if (table === 'stock_history') {
              return {
                insert: async () => ({ error: null }),
              };
            }
            return {};
          },
        }),
      },
    };
    delete require.cache[inventoryResolved];
    const inventory = require('../lib/inventory');
    await inventory.reserveStockForOrder(orderId, [{ quantity: 3, canonical_product_id: UUID_A }]);
    assert.strictEqual(inv.quantity_reserved, 3);
    assert.ok(orders.get(orderId).inventory_reserved_at);
  });

  it('releaseStockForOrder delegates to gc_release_stock_for_order_atomic', async () => {
    const orderId = ORDER_RELEASE;
    const orders = new Map([
      [
        orderId,
        {
          id: orderId,
          inventory_reserved_at: new Date().toISOString(),
          inventory_released_at: null,
        },
      ],
    ]);
    const inv = {
      canonical_product_id: UUID_B,
      quantity_reserved: 10,
    };

    require.cache[adminResolved] = {
      id: adminResolved,
      filename: adminResolved,
      loaded: true,
      exports: {
        getSupabaseAdmin: () => ({
          schema(schemaName) {
            if (schemaName !== 'gc_commerce') return { from: () => ({}) };
            return {
              from(table) {
                if (table !== 'orders') return {};
                return {
                  select() {
                    return {
                      eq(_f, id) {
                        return {
                          maybeSingle: async () => ({
                            data: orders.get(id) || null,
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
          async rpc(name, args) {
            if (name === 'gc_release_stock_for_order_atomic' && args.p_order_id === orderId) {
              inv.quantity_reserved = Math.max(0, (inv.quantity_reserved ?? 0) - 4);
              const o = orders.get(orderId);
              if (o) o.inventory_released_at = new Date().toISOString();
              return { data: { ok: true, skipped: false }, error: null };
            }
            return { data: null, error: { message: 'unknown rpc ' + name } };
          },
          from() {
            return {};
          },
        }),
      },
    };
    delete require.cache[inventoryResolved];
    const inventory = require('../lib/inventory');
    await inventory.releaseStockForOrder(orderId);
    assert.strictEqual(inv.quantity_reserved, 6);
    assert.ok(orders.get(orderId).inventory_released_at);
  });

  it('deductStockForOrder delegates to gc_deduct_stock_for_order_atomic', async () => {
    const orderId = ORDER_DEDUCT;
    const orders = new Map([
      [
        orderId,
        {
          id: orderId,
          inventory_deducted_at: null,
        },
      ],
    ]);
    const inv = {
      canonical_product_id: UUID_A,
      quantity_on_hand: 40,
      quantity_reserved: 15,
    };

    require.cache[adminResolved] = {
      id: adminResolved,
      filename: adminResolved,
      loaded: true,
      exports: {
        getSupabaseAdmin: () => ({
          schema(schemaName) {
            if (schemaName !== 'gc_commerce') return { from: () => ({}) };
            return {
              from(table) {
                if (table !== 'orders') return {};
                return {
                  select() {
                    return {
                      eq(_f, id) {
                        return {
                          maybeSingle: async () => ({
                            data: orders.get(id) || null,
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
          async rpc(name, args) {
            if (name === 'gc_deduct_stock_for_order_atomic' && args.p_order_id === orderId) {
              inv.quantity_on_hand -= 5;
              inv.quantity_reserved -= 5;
              const o = orders.get(orderId);
              if (o) o.inventory_deducted_at = new Date().toISOString();
              return { data: { ok: true, skipped: false }, error: null };
            }
            return { data: null, error: { message: 'unknown rpc ' + name } };
          },
          from() {
            return {};
          },
        }),
      },
    };
    delete require.cache[inventoryResolved];
    const inventory = require('../lib/inventory');
    await inventory.deductStockForOrder(orderId);
    assert.strictEqual(inv.quantity_on_hand, 35);
    assert.strictEqual(inv.quantity_reserved, 10);
    assert.ok(orders.get(orderId).inventory_deducted_at);
  });

  it('receivePurchaseOrder upserts inventory keyed by canonical_product_id', async () => {
    const poId = 501;
    let inserted = null;
    const invByCanon = new Map();

    require.cache[adminResolved] = {
      id: adminResolved,
      filename: adminResolved,
      loaded: true,
      exports: {
        getSupabaseAdmin: () => ({
          schema(schemaName) {
            if (schemaName === 'catalogos') {
              return {
                from(table) {
                  if (table === 'products') {
                    return {
                      select() {
                        return {
                          in() {
                            return Promise.resolve({
                              data: [{ id: UUID_A }],
                              error: null,
                            });
                          },
                        };
                      },
                    };
                  }
                  return {};
                },
              };
            }
            return { from: () => ({}) };
          },
          from(table) {
            if (table === 'purchase_orders') {
              return {
                select() {
                  return {
                    eq(_f, id) {
                      return {
                        maybeSingle: async () =>
                          id === poId
                            ? { data: { lines: [], received_lines: [] }, error: null }
                            : { data: null, error: null },
                      };
                    },
                  };
                },
                update() {
                  return {
                    eq() {
                      return Promise.resolve({ error: null });
                    },
                  };
                },
              };
            }
            if (table === 'inventory') {
              return {
                select() {
                  return {
                    eq(field, val) {
                      return {
                        maybeSingle: async () => {
                          if (field === 'canonical_product_id' && val === UUID_A) {
                            const row = invByCanon.get(UUID_A);
                            return row
                              ? { data: { ...row }, error: null }
                              : { data: null, error: null };
                          }
                          if (field === 'id') {
                            return { data: null, error: null };
                          }
                          return { data: null, error: null };
                        },
                      };
                    },
                  };
                },
                insert(row) {
                  inserted = { ...row };
                  invByCanon.set(UUID_A, {
                    canonical_product_id: row.canonical_product_id,
                    quantity_on_hand: row.quantity_on_hand ?? 0,
                    quantity_reserved: row.quantity_reserved ?? 0,
                    incoming_quantity: row.incoming_quantity ?? 0,
                    reorder_point: 0,
                    bin_location: '',
                  });
                  return Promise.resolve({ error: null });
                },
                update(payload) {
                  return {
                    eq(field, val) {
                      if (field === 'canonical_product_id' && val === UUID_A) {
                        const row = invByCanon.get(UUID_A);
                        if (row) Object.assign(row, payload);
                      }
                      return Promise.resolve({ error: null });
                    },
                  };
                },
              };
            }
            if (table === 'stock_history') {
              return { insert: async () => ({ error: null }) };
            }
            return {};
          },
        }),
      },
    };
    delete require.cache[inventoryResolved];
    const inventory = require('../lib/inventory');
    await inventory.receivePurchaseOrder(poId, [{ canonical_product_id: UUID_A, quantity_received: 3 }]);
    assert.ok(inserted);
    assert.strictEqual(inserted.canonical_product_id, UUID_A);
    assert.strictEqual(invByCanon.get(UUID_A).quantity_on_hand, 3);
  });
});
