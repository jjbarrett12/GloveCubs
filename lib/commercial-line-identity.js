'use strict';

/**
 * Phase 0B: explicit catalog_variant_id + variant_sku commercial identity (no inference).
 * Enable enforcement with VARIANT_MANDATORY_ENFORCE=1|true|yes|on (default off).
 */

const { normalizeCanonicalUuidInput, resolveLineCatalogProductId } = require('./resolve-canonical-product-id');

function isVariantMandatoryEnforceEnabled() {
  const v = process.env.VARIANT_MANDATORY_ENFORCE;
  if (v === '0' || v === 'off' || String(v || '').toLowerCase() === 'false' || String(v || '').toLowerCase() === 'no') {
    return false;
  }
  return v === '1' || v === 'true' || String(v || '').toLowerCase() === 'yes' || String(v || '').toLowerCase() === 'on';
}

/**
 * @param {unknown} line
 * @returns {boolean}
 */
function lineHasExplicitVariantIdentity(line) {
  const vid = normalizeCanonicalUuidInput(line && line.catalog_variant_id);
  const sku = line && line.variant_sku != null ? String(line.variant_sku).trim() : '';
  return Boolean(vid && sku);
}

/**
 * Validate commercial line identity against catalog_v2 (no size inference).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} line
 * @param {{ allowInactive?: boolean }} [opts]
 * @returns {Promise<{ ok: true, catalog_variant_id: string, variant_sku: string, catalog_product_id: string } | { ok: false, code: string, message: string }>}
 */
async function assertCommercialLineIdentity(supabase, line, opts = {}) {
  const vid = normalizeCanonicalUuidInput(line.catalog_variant_id);
  const sku = line.variant_sku != null ? String(line.variant_sku).trim() : '';
  const parentHint = normalizeCanonicalUuidInput(
    resolveLineCatalogProductId(line) || line.catalog_product_id,
  );

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
  if (!vRow) {
    return { ok: false, code: 'VARIANT_NOT_FOUND', message: 'catalog_variant_id does not match an active catalog variant.' };
  }
  if (!opts.allowInactive && !vRow.is_active) {
    return { ok: false, code: 'VARIANT_NOT_FOUND', message: 'catalog_variant_id does not match an active catalog variant.' };
  }
  const dbSku = String(vRow.variant_sku || '').trim();
  if (!dbSku) {
    return { ok: false, code: 'VARIANT_SKU_BLANK', message: 'Active catalog variant has no variant_sku.' };
  }
  if (dbSku !== sku) {
    return {
      ok: false,
      code: 'VARIANT_SKU_MISMATCH',
      message: 'variant_sku does not match catalog_variants row for catalog_variant_id.',
    };
  }
  const catalogProductId = String(vRow.catalog_product_id);
  if (parentHint && parentHint !== catalogProductId) {
    return {
      ok: false,
      code: 'VARIANT_PARENT_MISMATCH',
      message: 'catalog_variant_id belongs to a different catalog product than this line.',
    };
  }

  return {
    ok: true,
    catalog_variant_id: String(vRow.id),
    variant_sku: dbSku,
    catalog_product_id: catalogProductId,
  };
}

module.exports = {
  isVariantMandatoryEnforceEnabled,
  lineHasExplicitVariantIdentity,
  assertCommercialLineIdentity,
};
