'use strict';

const commerceShipping = require('./commerce-shipping');

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function round4(n) {
  return Math.round(Number(n) * 10000) / 10000;
}

/**
 * Stable fingerprint of shipping policy at order time (includes DB version id when present).
 */
function buildShippingPolicyVersion(shipCfg = commerceShipping.getCommerceShippingConfig()) {
  const thr = shipCfg.freeShippingThreshold;
  const flat = shipCfg.flatShippingRate;
  const min = shipCfg.minOrderAmount;
  const vid = shipCfg.shipping_policy_version_id;
  const idPart =
    vid != null && vid !== '' && Number.isFinite(Number(vid)) ? `spv_id=${Number(vid)}|` : '';
  return `${idPart}thr=${thr}|flat=${flat}|min=${min}`;
}

/**
 * True when subtotal qualified for free shipping under the policy in effect (threshold 0 = always free).
 */
function computeIsFreeShippingAtOrder(subtotal, shipCfg) {
  const s = Number(subtotal);
  const thr = Math.max(0, Number(shipCfg.freeShippingThreshold) || 0);
  if (thr <= 0) return true;
  return Number.isFinite(s) && s >= thr;
}

function parseOptionalCost(key) {
  const v = process.env[key];
  if (v == null || v === '') return null;
  const x = parseFloat(v);
  return Number.isFinite(x) && x >= 0 ? x : null;
}

/**
 * Snapshot the same flat assumptions used by shipping-margin analytics (optional env).
 */
function estimatedFulfillmentCostAtOrder(shippingChargedUsd) {
  const s = Number(shippingChargedUsd);
  if (!Number.isFinite(s) || s < 0) return null;
  const whenPaid = parseOptionalCost('ANALYTICS_ASSUMED_CARRIER_COST_WHEN_CUSTOMER_PAYS_SHIPPING');
  const whenFree = parseOptionalCost('ANALYTICS_ASSUMED_CARRIER_COST_WHEN_FREE_SHIPPING_TO_CUSTOMER');
  if (s > 0) {
    return whenPaid != null ? round2(whenPaid) : null;
  }
  return whenFree != null ? round2(whenFree) : null;
}

/**
 * Fields to merge onto the orders insert row (excluding items).
 */
function buildOrderEconomicsOrderFields({ subtotal, shipping, shipCfg }) {
  const cfg = shipCfg || commerceShipping.getCommerceShippingConfig();
  const shipNum = Number(shipping);
  const subNum = Number(subtotal);
  const out = {
    is_free_shipping_at_order: computeIsFreeShippingAtOrder(subNum, cfg),
    shipping_threshold_at_order: round2(cfg.freeShippingThreshold),
    shipping_flat_rate_at_order: round2(cfg.flatShippingRate),
    shipping_min_order_at_order: round2(cfg.minOrderAmount),
    shipping_policy_version: buildShippingPolicyVersion(cfg),
    estimated_fulfillment_cost_usd: estimatedFulfillmentCostAtOrder(shipNum),
  };
  if (cfg.shipping_policy_version_id != null && Number.isFinite(Number(cfg.shipping_policy_version_id))) {
    out.shipping_policy_version_id = Number(cfg.shipping_policy_version_id);
  }
  return out;
}

/**
 * From checkout line (product.cost snapshot) build item payload fields for order_items.
 */
function buildLineCostSnapshotFields(unitCostRaw, quantity) {
  const qty = Math.max(0, Number(quantity) || 0);
  const uc = Number(unitCostRaw);
  if (!Number.isFinite(uc) || uc < 0) {
    return { unit_cost_at_order: null, total_cost_at_order: null };
  }
  const unit = round4(uc);
  const total = round2(unit * qty);
  return { unit_cost_at_order: unit, total_cost_at_order: total };
}

module.exports = {
  buildShippingPolicyVersion,
  computeIsFreeShippingAtOrder,
  estimatedFulfillmentCostAtOrder,
  buildOrderEconomicsOrderFields,
  buildLineCostSnapshotFields,
  round2,
};
