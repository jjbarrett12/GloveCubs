'use strict';

/**
 * Cart / checkout / order-creation shipping rules (single source of truth).
 *
 * Environment (all optional; defaults shown):
 *   FREE_SHIPPING_THRESHOLD — subtotal at or above → shipping 0 (default 500). Set 0 for always-free shipping.
 *   FLAT_SHIPPING_RATE      — shipping when subtotal below threshold (default 25).
 *   MIN_ORDER_AMOUNT        — minimum cart subtotal to place an order (default 200). Set 0 to disable the minimum.
 *
 * Client reads the same values via GET /api/commerce/shipping-config and GET /api/config (shipping.*).
 * Orders persist `shipping` on the row; invoices use that stored amount (see lib/order-invoice-totals.js).
 */

function envFloat(key, fallback) {
  const v = process.env[key];
  if (v == null || v === '') return fallback;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function getCommerceShippingConfig() {
  const freeShippingThreshold = Math.max(0, envFloat('FREE_SHIPPING_THRESHOLD', 500));
  const flatShippingRate = Math.max(0, envFloat('FLAT_SHIPPING_RATE', 25));
  const minOrderAmount = Math.max(0, envFloat('MIN_ORDER_AMOUNT', 200));
  return {
    freeShippingThreshold,
    flatShippingRate,
    minOrderAmount,
  };
}

/**
 * @param {number} subtotal
 * @param {ReturnType<typeof getCommerceShippingConfig>} [cfg]
 * @returns {number}
 */
function computeShippingFromSubtotal(subtotal, cfg = getCommerceShippingConfig()) {
  const s = Number(subtotal);
  if (!Number.isFinite(s) || s < 0) return cfg.flatShippingRate;
  const t = cfg.freeShippingThreshold;
  if (t <= 0) return 0;
  if (s >= t) return 0;
  return cfg.flatShippingRate;
}

/**
 * @param {number} subtotal
 * @param {ReturnType<typeof getCommerceShippingConfig>} [cfg]
 */
function validateMinimumOrder(subtotal, cfg = getCommerceShippingConfig()) {
  const s = Number(subtotal);
  const min = cfg.minOrderAmount;
  if (!Number.isFinite(min) || min <= 0) {
    return { ok: true, minOrderAmount: min, subtotal: s, shortBy: 0 };
  }
  if (!Number.isFinite(s)) {
    return { ok: false, minOrderAmount: min, subtotal: s, shortBy: min };
  }
  if (s < min) {
    return { ok: false, minOrderAmount: min, subtotal: s, shortBy: Math.round((min - s) * 100) / 100 };
  }
  return { ok: true, minOrderAmount: min, subtotal: s, shortBy: 0 };
}

/**
 * Dollars remaining until free shipping (0 if already qualifies or threshold disabled).
 * @param {number} subtotal
 * @param {ReturnType<typeof getCommerceShippingConfig>} [cfg]
 */
function amountToFreeShipping(subtotal, cfg = getCommerceShippingConfig()) {
  const s = Number(subtotal);
  const t = cfg.freeShippingThreshold;
  if (!Number.isFinite(s) || !Number.isFinite(t) || t <= 0) return 0;
  if (s >= t) return 0;
  return Math.round((t - s) * 100) / 100;
}

module.exports = {
  getCommerceShippingConfig,
  computeShippingFromSubtotal,
  validateMinimumOrder,
  amountToFreeShipping,
};
