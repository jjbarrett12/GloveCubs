'use strict';

/**
 * Pricing Authority V2 — server-side unit price resolver (Phase 0A).
 * Variant-grain only. Checkout/cart cutover via lib/pricing-authority-checkout.js (PRICING_AUTHORITY_V2_CHECKOUT=1, Phase 0E).
 *
 * Precedence (v2.0 shadow):
 * 1. company_id present → gc_resolve_buyer_unit_price (site best offer × company b2b tier)
 * 2. guest / no company → sellable list/bulk + user discount_tier (same math as commerce-pricing guest path)
 */

const commercePricing = require('./commerce-pricing');
const { normalizeCanonicalUuidInput } = require('./resolve-canonical-product-id');
const { getSupabaseAdmin, isSupabaseAdminConfigured } = require('./supabaseAdmin');

const AUTHORITY_VERSION = 'v2.0';

/**
 * @param {unknown} row
 * @returns {Record<string, unknown>|null}
 */
function asRecord(row) {
  if (row && typeof row === 'object' && !Array.isArray(row)) return row;
  return null;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} catalogVariantId
 * @param {string} variantSku
 */
async function validateVariantIdentity(supabase, catalogVariantId, variantSku) {
  const vid = normalizeCanonicalUuidInput(catalogVariantId);
  const sku = String(variantSku || '').trim();
  if (!vid) {
    return { ok: false, code: 'MISSING_CATALOG_VARIANT_ID', message: 'catalog_variant_id is required.' };
  }
  if (!sku) {
    return { ok: false, code: 'MISSING_VARIANT_SKU', message: 'variant_sku is required.' };
  }

  const { data: vRow, error } = await supabase
    .schema('catalog_v2')
    .from('catalog_variants')
    .select('id, variant_sku, catalog_product_id, is_active')
    .eq('id', vid)
    .maybeSingle();
  if (error) {
    return { ok: false, code: 'VARIANT_QUERY_ERROR', message: error.message };
  }
  if (!vRow || !vRow.is_active) {
    return { ok: false, code: 'VARIANT_NOT_FOUND', message: 'catalog_variant_id is missing or inactive.' };
  }
  if (String(vRow.variant_sku || '').trim() !== sku) {
    return {
      ok: false,
      code: 'VARIANT_SKU_MISMATCH',
      message: 'variant_sku does not match catalog_variants row for catalog_variant_id.',
    };
  }
  return {
    ok: true,
    catalog_variant_id: String(vRow.id),
    variant_sku: sku,
    catalog_product_id: String(vRow.catalog_product_id),
  };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} companyId
 * @param {string} catalogVariantId
 * @param {number} quantity
 */
async function resolveCompanyPriceViaRpc(supabase, companyId, catalogVariantId, quantity) {
  const { data, error } = await supabase.rpc('gc_resolve_buyer_unit_price', {
    p_company_id: companyId,
    p_catalog_variant_id: catalogVariantId,
    p_quantity: quantity,
  });
  if (error) {
    return { ok: false, code: 'RPC_ERROR', message: error.message };
  }
  const row = asRecord(data);
  if (!row) {
    return { ok: false, code: 'EMPTY_RPC_RESULT', message: 'gc_resolve_buyer_unit_price returned empty.' };
  }
  if (row.error != null) {
    return { ok: false, code: String(row.error), message: String(row.error) };
  }

  const resMajor = row.resolved_unit_price_major;
  const listMajor = row.list_unit_price_major;
  const priceAvailable = resMajor != null && Number.isFinite(Number(resMajor));

  return {
    ok: true,
    price_available: priceAvailable,
    catalog_variant_id: String(row.catalog_variant_id ?? catalogVariantId),
    catalog_product_id: row.catalog_product_id != null ? String(row.catalog_product_id) : undefined,
    variant_sku: undefined,
    quantity: Number(row.quantity ?? quantity),
    list_reference_unit_price_major: listMajor == null ? null : Number(listMajor),
    list_reference_unit_price_minor:
      row.list_unit_price_minor == null ? null : Number(row.list_unit_price_minor),
    resolved_unit_price_major: priceAvailable ? Number(resMajor) : null,
    resolved_unit_price_minor:
      row.resolved_unit_price_minor == null ? null : Number(row.resolved_unit_price_minor),
    pricing_source: String(row.pricing_source || 'company_tier_off_list_v1'),
    pricing_mode_applied: 'tier_off_list',
    discount_percent_applied: Number(row.discount_percent ?? 0),
    tier_code_applied: row.pricing_tier_code != null ? String(row.pricing_tier_code) : null,
    used_company_contract: true,
    currency_code: String(row.currency_code || 'USD'),
    authority_version: AUTHORITY_VERSION,
    precedence_step: 2,
  };
}

/**
 * @param {object} params
 * @param {import('@supabase/supabase-js').SupabaseClient} [params.supabase]
 * @param {string} params.catalog_variant_id
 * @param {string} params.variant_sku
 * @param {number} [params.quantity]
 * @param {object|null} [params.user]
 * @param {string|null} [params.companyId]
 * @param {object|null} [params.pricingContext]
 * @param {object|null} [params.product] - required when companyId is null (sellable path)
 * @param {string} [params.flow]
 */
async function resolvePricingAuthorityV2(params) {
  const supabase = params.supabase || (isSupabaseAdminConfigured() ? getSupabaseAdmin() : null);
  if (!supabase) {
    return { ok: false, code: 'SUPABASE_UNAVAILABLE', message: 'Supabase admin client is not configured.' };
  }

  const quantity = Math.max(1, Math.min(99999, parseInt(String(params.quantity), 10) || 1));
  const flow = params.flow != null ? String(params.flow) : 'unknown';

  const validated = await validateVariantIdentity(supabase, params.catalog_variant_id, params.variant_sku);
  if (!validated.ok) {
    return {
      ok: false,
      price_available: false,
      code: validated.code,
      message: validated.message,
      flow,
      authority_version: AUTHORITY_VERSION,
    };
  }

  const companyId = params.companyId != null ? String(params.companyId) : null;

  if (companyId) {
    const companyRes = await resolveCompanyPriceViaRpc(
      supabase,
      companyId,
      validated.catalog_variant_id,
      quantity,
    );
    if (!companyRes.ok) {
      return {
        ok: false,
        price_available: false,
        code: companyRes.code,
        message: companyRes.message,
        catalog_variant_id: validated.catalog_variant_id,
        catalog_product_id: validated.catalog_product_id,
        variant_sku: validated.variant_sku,
        flow,
        authority_version: AUTHORITY_VERSION,
      };
    }
    return {
      ok: true,
      ...companyRes,
      variant_sku: validated.variant_sku,
      catalog_product_id: validated.catalog_product_id,
      flow,
    };
  }

  const product = params.product;
  if (!product) {
    return {
      ok: false,
      price_available: false,
      code: 'PRODUCT_REQUIRED',
      message: 'product row required for guest pricing authority path',
      catalog_variant_id: validated.catalog_variant_id,
      catalog_product_id: validated.catalog_product_id,
      variant_sku: validated.variant_sku,
      flow,
      authority_version: AUTHORITY_VERSION,
    };
  }

  const guest = commercePricing.resolveLineUnitPriceForCheckout({
    user: params.user || null,
    companyId: null,
    product,
    quantity,
    pricingContext: params.pricingContext || { companies: [], customer_manufacturer_pricing: [] },
  });

  const unitMajor = Number(guest.unitPrice);
  const priceAvailable = Number.isFinite(unitMajor) && unitMajor >= 0;

  return {
    ok: true,
    price_available: priceAvailable,
    catalog_variant_id: validated.catalog_variant_id,
    catalog_product_id: validated.catalog_product_id,
    variant_sku: validated.variant_sku,
    quantity,
    list_reference_unit_price_major: guest.listUnitPrice,
    list_reference_unit_price_minor: null,
    resolved_unit_price_major: priceAvailable ? unitMajor : null,
    resolved_unit_price_minor: priceAvailable ? Math.round(unitMajor * 100) : null,
    pricing_source: guest.tierPercentApplied > 0 ? 'guest_sellable_user_tier_v1' : 'guest_sellable_list_v1',
    pricing_mode_applied: 'guest_list',
    discount_percent_applied: guest.tierPercentApplied,
    tier_code_applied: params.user?.discount_tier != null ? String(params.user.discount_tier) : null,
    used_company_contract: false,
    currency_code: 'USD',
    authority_version: AUTHORITY_VERSION,
    precedence_step: guest.tierPercentApplied > 0 ? 4 : 5,
    flow,
  };
}

module.exports = {
  AUTHORITY_VERSION,
  resolvePricingAuthorityV2,
  validateVariantIdentity,
};
