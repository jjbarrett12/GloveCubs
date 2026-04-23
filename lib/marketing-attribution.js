'use strict';

/**
 * Sanitize client-supplied marketing attribution for persistence on orders.
 * Does not affect pricing or totals.
 */
const ALLOWED_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
  'msclkid',
  'ttclid',
  'first_seen_at',
  'landing_path',
];

const MAX_LEN = 240;

/**
 * @param {unknown} raw
 * @returns {Record<string, string> | null}
 */
function sanitizeMarketingAttribution(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const k of ALLOWED_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(raw, k)) continue;
    const v = raw[k];
    if (v == null) continue;
    const s = String(v).trim().slice(0, k === 'landing_path' ? 500 : MAX_LEN);
    if (s) out[k] = s;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * @param {Array<{ product_id?: number, name?: string, sku?: string, quantity?: number, price?: number, unit_price?: number }>} lines
 */
function buildPurchaseItemsForAnalytics(lines) {
  if (!Array.isArray(lines)) return [];
  return lines.map((i) => ({
    product_id: i.product_id != null ? Number(i.product_id) : null,
    sku: i.sku || null,
    name: (i.name || i.product_name || '').toString().slice(0, 200),
    quantity: Math.max(0, Number(i.quantity) || 0),
    unit_price: Number(i.price != null ? i.price : i.unit_price) || 0,
  }));
}

module.exports = {
  sanitizeMarketingAttribution,
  buildPurchaseItemsForAnalytics,
};
