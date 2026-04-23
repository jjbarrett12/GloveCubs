'use strict';

/**
 * Single source of truth for checkout line unit pricing (cart display, order rows, PaymentIntent).
 *
 * Contract: same inputs => same unit price as charged on POST /api/orders and create-payment-intent.
 */

const { getEffectiveMargin, computeSellPrice } = require('./pricing');

/**
 * Approved B2B tier discount on the pre-tier base (not applied to guests / unapproved).
 * Uses pricingContext.tier_discount_by_code from DB when present (single pricing truth).
 * @param {object | null | undefined} user
 * @param {Record<string, number> | null | undefined} tierDiscountByCode - from getPricingContext()
 * @returns {number} 0–100
 */
function getTierDiscountPercentForUser(user, tierDiscountByCode) {
  if (!user || !user.is_approved) return 0;
  const code = String(user.discount_tier || 'standard').toLowerCase();
  const map = tierDiscountByCode && typeof tierDiscountByCode === 'object' ? tierDiscountByCode : null;
  if (map && Object.prototype.hasOwnProperty.call(map, code)) {
    const v = Number(map[code]);
    if (Number.isFinite(v) && v >= 0 && v <= 100) return v;
  }
  switch (code) {
    case 'bronze':
      return 5;
    case 'silver':
      return 10;
    case 'gold':
      return 15;
    case 'platinum':
      return 20;
    default:
      return 0;
  }
}

function numOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * @typedef {object} CheckoutPricingResult
 * @property {number} unitPrice - Final unit price charged (after tier); use for subtotal = sum(unitPrice * qty).
 * @property {number} listUnitPrice - Published list (`product.price`); always truthful, not margin-inflated.
 * @property {number | null} catalogBulkUnitPrice - DB bulk/B2B list price when set; null if absent.
 * @property {number} baseBeforeTier - Unit price before tier discount (margin sell or catalog bulk/list base).
 * @property {number} tierPercentApplied - Tier percent applied to base (0 if none).
 * @property {boolean} usedCompanyMarginPricing - True when company contract pricing (cost + margin) set the base.
 */

/**
 * Resolve the canonical checkout unit price for one line.
 *
 * @param {object} params
 * @param {object | null} params.user - Full user row (is_approved, discount_tier).
 * @param {number | null} params.companyId - Company id when linked; null for guests / no company.
 * @param {object} params.product - Product row (price, bulk_price, cost, manufacturer_id).
 * @param {number} [params.quantity] - Reserved for future qty breaks; ignored today.
 * @param {object} params.pricingContext - { companies, customer_manufacturer_pricing, tier_discount_by_code } for getEffectiveMargin + tier %.
 * @returns {CheckoutPricingResult}
 */
function resolveLineUnitPriceForCheckout({
  user,
  companyId,
  product,
  quantity: _quantity = 1,
  pricingContext,
}) {
  const listUnitPrice = numOrNull(product?.price) ?? 0;
  const catalogBulkUnitPrice = numOrNull(product?.bulk_price);

  let baseBeforeTier;
  let usedCompanyMarginPricing = false;

  if (companyId != null && product) {
    const cost =
      product.cost != null && product.cost !== ''
        ? Number(product.cost)
        : product.price != null
          ? Number(product.price)
          : 0;
    const margin = getEffectiveMargin(pricingContext || {}, companyId, product.manufacturer_id);
    const sell = computeSellPrice(cost, margin);
    baseBeforeTier = !Number.isNaN(sell) ? sell : listUnitPrice;
    usedCompanyMarginPricing = true;
  } else {
    baseBeforeTier =
      user && user.is_approved && catalogBulkUnitPrice != null ? catalogBulkUnitPrice : listUnitPrice;
  }

  const tierPercentApplied = getTierDiscountPercentForUser(user, pricingContext?.tier_discount_by_code);
  let unitPrice = baseBeforeTier;
  if (tierPercentApplied > 0) {
    unitPrice = baseBeforeTier * (1 - tierPercentApplied / 100);
  }

  return {
    unitPrice,
    listUnitPrice,
    catalogBulkUnitPrice,
    baseBeforeTier,
    tierPercentApplied,
    usedCompanyMarginPricing,
  };
}

module.exports = {
  resolveLineUnitPriceForCheckout,
  getTierDiscountPercentForUser,
};
