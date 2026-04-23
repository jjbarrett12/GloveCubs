/**
 * Contract: checkout endpoints reject any client-supplied money fields.
 * Run: node --test tests/checkout-client-body-guard.test.js
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  CLIENT_TOTAL_REJECT_KEYS,
  assertNoClientSuppliedTotals,
} = require('../lib/checkout-client-body-guard');

describe('checkout-client-body-guard', () => {
  it('rejects every documented spoof key', () => {
    for (const key of CLIENT_TOTAL_REJECT_KEYS) {
      const r = assertNoClientSuppliedTotals({ [key]: 1 });
      assert.equal(r.ok, false, `expected rejection for body key ${key}`);
      assert.equal(r.key, key);
    }
  });

  it('allows normal checkout payload keys', () => {
    const r = assertNoClientSuppliedTotals({
      shipping_address: { address_line1: '1 Main', city: 'X', state: 'NY', zip_code: '10001' },
      ship_to_id: null,
      notes: '',
      payment_method: 'credit_card',
    });
    assert.equal(r.ok, true);
  });

  it('allows empty body', () => {
    assert.equal(assertNoClientSuppliedTotals(null).ok, true);
    assert.equal(assertNoClientSuppliedTotals(undefined).ok, true);
    assert.equal(assertNoClientSuppliedTotals({}).ok, true);
  });
});
