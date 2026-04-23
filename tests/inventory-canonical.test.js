/**
 * inventory-canonical.js: explicit UUID resolution only (V2).
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { resolveCanonicalForInventoryEvent } = require('../lib/inventory-canonical');

const U = '11111111-2222-4222-8444-555555555555';

describe('inventory-canonical', () => {
  it('resolveCanonicalForInventoryEvent prefers explicit line UUID', async () => {
    const r = await resolveCanonicalForInventoryEvent(99, { explicitLine: U, explicitRow: null }, 'test');
    assert.equal(r.source, 'explicit_line');
    assert.equal(r.uuid, U);
  });

  it('resolveCanonicalForInventoryEvent uses inventory row when line absent', async () => {
    const r = await resolveCanonicalForInventoryEvent(5, { explicitLine: null, explicitRow: U }, 'test');
    assert.equal(r.source, 'inventory_row');
    assert.equal(r.uuid, U);
  });

  it('resolveCanonicalForInventoryEvent returns null without UUID hints', async () => {
    const r = await resolveCanonicalForInventoryEvent(7, { explicitLine: null, explicitRow: null }, 'test_bridge');
    assert.equal(r.source, null);
    assert.equal(r.uuid, null);
  });
});
