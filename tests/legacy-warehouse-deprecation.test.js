'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const {
  WAREHOUSE_MIGRATION_MESSAGE,
  WAREHOUSE_MIGRATION_CODE,
  LegacyWarehouseWriteDisabledError,
  assertLegacyWarehouseWriteBlocked,
  sendWarehouseMigrationGone,
} = require('../lib/legacy-warehouse-deprecation');

const UUID_A = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

describe('legacy warehouse deprecation', () => {
  it('assertLegacyWarehouseWriteBlocked throws with migration message', () => {
    assert.throws(() => assertLegacyWarehouseWriteBlocked(), (err) => {
      assert.ok(err instanceof LegacyWarehouseWriteDisabledError);
      assert.strictEqual(err.message, WAREHOUSE_MIGRATION_MESSAGE);
      return true;
    });
  });

  it('sendWarehouseMigrationGone responds 410 with native workflow hint', () => {
    let statusCode = null;
    let body = null;
    sendWarehouseMigrationGone(
      {
        status(code) {
          statusCode = code;
          return this;
        },
        json(payload) {
          body = payload;
        },
      },
      '/admin/inventory',
    );
    assert.strictEqual(statusCode, 410);
    assert.strictEqual(body.error, WAREHOUSE_MIGRATION_MESSAGE);
    assert.strictEqual(body.code, WAREHOUSE_MIGRATION_CODE);
    assert.strictEqual(body.native_workflow, '/admin/inventory');
  });

  it('adjustStock cannot write public.inventory (blocked before Supabase)', async () => {
    delete require.cache[require.resolve('../lib/inventory')];
    const inventory = require('../lib/inventory');
    await assert.rejects(
      () => inventory.adjustStock(UUID_A, 5, 'test', { type: 'admin' }, null),
      (err) => {
        assert.strictEqual(err.message, WAREHOUSE_MIGRATION_MESSAGE);
        return true;
      },
    );
  });

  it('receivePurchaseOrder cannot write public.inventory (blocked before Supabase)', async () => {
    delete require.cache[require.resolve('../lib/inventory')];
    const inventory = require('../lib/inventory');
    await assert.rejects(
      () => inventory.receivePurchaseOrder(99, [{ canonical_product_id: UUID_A, quantity_received: 1 }]),
      (err) => {
        assert.strictEqual(err.message, WAREHOUSE_MIGRATION_MESSAGE);
        return true;
      },
    );
  });

  it('setIncomingQuantity cannot write public.inventory', async () => {
    delete require.cache[require.resolve('../lib/inventory')];
    const inventory = require('../lib/inventory');
    await assert.rejects(
      () => inventory.setIncomingQuantity(UUID_A, 10),
      (err) => {
        assert.strictEqual(err.message, WAREHOUSE_MIGRATION_MESSAGE);
        return true;
      },
    );
  });
});

describe('Express legacy warehouse mutation routes return 410', () => {
  const legacyRoutes = [
    "app.put('/api/admin/inventory/:product_id'",
    "app.post('/api/admin/inventory/adjust'",
    "app.post('/api/admin/inventory/cycle'",
    "app.post('/api/admin/purchase-orders/:id/receive'",
    "app.post('/api/fishbowl/sync-inventory'",
  ];

  for (const route of legacyRoutes) {
    it(`${route} uses sendWarehouseMigrationGone`, () => {
      const idx = serverSrc.indexOf(route);
      assert.ok(idx >= 0, `missing route ${route}`);
      const block = serverSrc.slice(idx, idx + 400);
      assert.ok(block.includes('sendWarehouseMigrationGone'), `${route} must return 410 Gone`);
      assert.ok(!block.includes('inventory.adjustStock'), `${route} must not call adjustStock`);
      assert.ok(!block.includes('inventory.receivePurchaseOrder'), `${route} must not call receivePurchaseOrder`);
    });
  }

  it('server.js has no direct inventory.adjustStock calls', () => {
    assert.ok(!serverSrc.includes('inventory.adjustStock'));
  });

  it('server.js has no direct inventory.receivePurchaseOrder calls', () => {
    assert.ok(!serverSrc.includes('inventory.receivePurchaseOrder'));
  });
});
