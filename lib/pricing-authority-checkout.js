'use strict';

/**
 * Phase 0E: single checkout/cart line unit price path (legacy vs Pricing Authority V2).
 * Cutover: PRICING_AUTHORITY_V2_CHECKOUT=1. Shadow (legacy only): PRICING_AUTHORITY_V2_SHADOW=1.
 */

const commercePricing = require('./commerce-pricing');
const { resolvePricingAuthorityV2 } = require('./pricing-authority-v2');
const { isPricingAuthorityV2ShadowEnabled, shadowComparePricingLine } = require('./pricing-authority-shadow');

function isPricingAuthorityV2CheckoutEnabled() {
  const v = process.env.PRICING_AUTHORITY_V2_CHECKOUT;
  if (v === '0' || v === 'off' || String(v || '').toLowerCase() === 'false' || String(v || '').toLowerCase() === 'no') {
    return false;
  }
  return v === '1' || v === 'true' || String(v || '').toLowerCase() === 'yes' || String(v || '').toLowerCase() === 'on';
}

/**
 * Resolve charged unit price for cart GET / checkout compute / reorder preview.
 *
 * @param {object} params
 * @param {string} params.flow
 * @param {object|null} params.user
 * @param {string|number|null} params.companyId
 * @param {object} params.product
 * @param {number} params.quantity
 * @param {object} params.pricingContext
 * @param {string} params.catalog_variant_id
 * @param {string} params.variant_sku
 * @param {string} [params.catalog_product_id]
 * @returns {Promise<
 *   | { ok: true, unitPrice: number, listUnitPrice: number, catalogBulkUnitPrice: number|null, tierPercentApplied: number, pricing_source: string, authority_version?: string }
 *   | { ok: false, status: number, code: string, message: string }
 * >}
 */
async function resolveCheckoutLineUnitPrice(params) {
  const quantity = Math.max(1, parseInt(String(params.quantity), 10) || 1);
  const catalogVariantId = params.catalog_variant_id;
  const variantSku = params.variant_sku;

  if (isPricingAuthorityV2CheckoutEnabled()) {
    const authority = await resolvePricingAuthorityV2({
      catalog_variant_id: catalogVariantId,
      variant_sku: variantSku,
      quantity,
      user: params.user ?? null,
      companyId: params.companyId ?? null,
      pricingContext: params.pricingContext ?? null,
      product: params.product ?? null,
      flow: params.flow,
    });

    if (!authority.ok) {
      return {
        ok: false,
        status: 422,
        code: authority.code || 'PRICING_AUTHORITY_ERROR',
        message: authority.message || 'Pricing authority could not resolve this line.',
      };
    }

    if (!authority.price_available || authority.resolved_unit_price_major == null) {
      return {
        ok: false,
        status: 422,
        code: 'PRICE_NOT_AVAILABLE',
        message: 'No unit price available from pricing authority for this variant.',
      };
    }

    const unitPrice = Number(authority.resolved_unit_price_major);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return {
        ok: false,
        status: 422,
        code: 'PRICE_NOT_AVAILABLE',
        message: 'Pricing authority returned an invalid unit price.',
      };
    }

    const listUnitPrice =
      authority.list_reference_unit_price_major != null &&
      Number.isFinite(Number(authority.list_reference_unit_price_major))
        ? Number(authority.list_reference_unit_price_major)
        : unitPrice;

    return {
      ok: true,
      unitPrice,
      listUnitPrice,
      catalogBulkUnitPrice:
        params.product && params.product.bulk_price != null ? Number(params.product.bulk_price) : null,
      tierPercentApplied: Number(authority.discount_percent_applied ?? 0),
      pricing_source: String(authority.pricing_source || 'pricing_authority_v2'),
      authority_version: authority.authority_version,
    };
  }

  const legacy = commercePricing.resolveLineUnitPriceForCheckout({
    user: params.user ?? null,
    companyId: params.companyId ?? null,
    product: params.product,
    quantity,
    pricingContext: params.pricingContext ?? { companies: [], customer_manufacturer_pricing: [] },
  });

  if (isPricingAuthorityV2ShadowEnabled() && catalogVariantId && variantSku) {
    setImmediate(() => {
      shadowComparePricingLine({
        flow: params.flow,
        legacyUnitPriceMajor: legacy.unitPrice,
        catalog_variant_id: catalogVariantId,
        variant_sku: variantSku,
        catalog_product_id: params.catalog_product_id,
        user: params.user ?? null,
        companyId: params.companyId ?? null,
        pricingContext: params.pricingContext ?? null,
        product: params.product ?? null,
        quantity,
      }).catch(() => {});
    });
  }

  return {
    ok: true,
    unitPrice: legacy.unitPrice,
    listUnitPrice: legacy.listUnitPrice,
    catalogBulkUnitPrice: legacy.catalogBulkUnitPrice,
    tierPercentApplied: legacy.tierPercentApplied,
    pricing_source: 'commerce-pricing.resolveLineUnitPriceForCheckout',
  };
}

module.exports = {
  isPricingAuthorityV2CheckoutEnabled,
  resolveCheckoutLineUnitPrice,
};
