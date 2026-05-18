'use strict';

/**
 * Phase 0A: shadow-compare legacy commerce-pricing vs Pricing Authority V2.
 * Enable with PRICING_AUTHORITY_V2_SHADOW=1. Does not change charged prices.
 */

const { resolvePricingAuthorityV2 } = require('./pricing-authority-v2');
const { isSupabaseAdminConfigured } = require('./supabaseAdmin');

const SHADOW_TAG = '[GC_PRICING_AUTHORITY_SHADOW]';
const DELTA_ALERT_MAJOR = 0.01;

function isPricingAuthorityV2ShadowEnabled() {
  const v = process.env.PRICING_AUTHORITY_V2_SHADOW;
  return v === '1' || v === 'true' || String(v || '').toLowerCase() === 'yes';
}

/**
 * @param {Record<string, unknown>} payload
 */
function logPricingAuthorityShadow(payload) {
  try {
    console.warn(SHADOW_TAG, JSON.stringify({ ...payload, ts: new Date().toISOString() }));
  } catch (_) {
    console.warn(SHADOW_TAG, payload);
  }
}

/**
 * Compare legacy checkout unit price (major USD) to authority v2. Never throws.
 *
 * @param {object} params
 * @param {string} params.flow - e.g. cart_get, checkout_compute
 * @param {number} params.legacyUnitPriceMajor
 * @param {string} params.catalog_variant_id
 * @param {string} params.variant_sku
 * @param {string} [params.catalog_product_id]
 * @param {object|null} [params.user]
 * @param {string|null} [params.companyId]
 * @param {object|null} [params.pricingContext]
 * @param {object|null} [params.product]
 * @param {number} [params.quantity]
 */
async function shadowComparePricingLine(params) {
  if (!isPricingAuthorityV2ShadowEnabled()) return;
  if (!isSupabaseAdminConfigured()) return;

  const legacyMajor = Number(params.legacyUnitPriceMajor);
  const legacyOk = Number.isFinite(legacyMajor);

  try {
    const authority = await resolvePricingAuthorityV2({
      catalog_variant_id: params.catalog_variant_id,
      variant_sku: params.variant_sku,
      quantity: params.quantity ?? 1,
      user: params.user ?? null,
      companyId: params.companyId ?? null,
      pricingContext: params.pricingContext ?? null,
      product: params.product ?? null,
      flow: params.flow,
    });

    if (!authority.ok) {
      logPricingAuthorityShadow({
        flow: params.flow,
        catalog_variant_id: params.catalog_variant_id,
        variant_sku: params.variant_sku,
        catalog_product_id: params.catalog_product_id,
        company_id: params.companyId ?? null,
        legacy_unit_price_major: legacyOk ? legacyMajor : null,
        authority_ok: false,
        authority_code: authority.code,
        authority_message: authority.message,
        recommendation: 'Fix authority inputs or variant identity before cutover',
      });
      return;
    }

    const authMajor =
      authority.price_available && authority.resolved_unit_price_major != null
        ? Number(authority.resolved_unit_price_major)
        : null;
    const authOk = authMajor != null && Number.isFinite(authMajor);
    const delta =
      legacyOk && authOk ? Math.round((authMajor - legacyMajor) * 10000) / 10000 : null;
    const absDelta = delta != null ? Math.abs(delta) : null;

    if (!legacyOk || !authOk || (absDelta != null && absDelta > DELTA_ALERT_MAJOR)) {
      logPricingAuthorityShadow({
        flow: params.flow,
        catalog_variant_id: params.catalog_variant_id,
        variant_sku: params.variant_sku,
        catalog_product_id: params.catalog_product_id ?? authority.catalog_product_id,
        company_id: params.companyId ?? null,
        legacy_unit_price_major: legacyOk ? legacyMajor : null,
        authority_unit_price_major: authOk ? authMajor : null,
        delta_major: delta,
        legacy_pricing_source: 'commerce-pricing.resolveLineUnitPriceForCheckout',
        authority_pricing_source: authority.pricing_source,
        authority_precedence_step: authority.precedence_step,
        price_available: authority.price_available,
        recommendation:
          params.companyId != null
            ? 'Expect deltas when legacy uses company margin and authority uses company tier off list'
            : 'Investigate guest sellable vs authority guest path',
      });
    }
  } catch (err) {
    logPricingAuthorityShadow({
      flow: params.flow,
      catalog_variant_id: params.catalog_variant_id,
      variant_sku: params.variant_sku,
      error: err && err.message ? err.message : String(err),
      recommendation: 'Shadow compare failed — fix before enabling checkout cutover',
    });
  }
}

module.exports = {
  SHADOW_TAG,
  DELTA_ALERT_MAJOR,
  isPricingAuthorityV2ShadowEnabled,
  logPricingAuthorityShadow,
  shadowComparePricingLine,
};
