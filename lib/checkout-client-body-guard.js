'use strict';

/**
 * Checkout endpoints must never trust client-supplied money fields.
 * Shared list for POST /api/checkout/quote and POST /api/orders/create-payment-intent.
 */
const CLIENT_TOTAL_REJECT_KEYS = [
  'total',
  'subtotal',
  'tax',
  'shipping',
  'discount',
  'amount',
  'amount_cents',
];

/**
 * @param {object|null|undefined} body
 * @returns {{ ok: true } | { ok: false, key: string }}
 */
function assertNoClientSuppliedTotals(body) {
  if (!body || typeof body !== 'object') return { ok: true };
  for (const k of CLIENT_TOTAL_REJECT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(body, k)) {
      return { ok: false, key: k };
    }
  }
  return { ok: true };
}

module.exports = {
  CLIENT_TOTAL_REJECT_KEYS,
  assertNoClientSuppliedTotals,
};
