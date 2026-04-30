'use strict';

const { normalizeCanonicalUuidInput, resolveLineCatalogProductId } = require('./resolve-canonical-product-id');

function requireVariantSku(variantSku) {
  const s = String(variantSku || '').trim();
  if (!s) {
    return { ok: false, code: 'VARIANT_SKU_BLANK', message: 'Active catalog variant has no variant_sku.' };
  }
  return { ok: true, variant_sku: s };
}

/**
 * Resolve catalog_v2.catalog_variants row for a commerce cart/order line.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ catalog_variant_id?: string|null, canonical_product_id?: string|null, product_id?: string|null, size?: string|null }} line
 * @returns {Promise<{ ok: true, catalog_variant_id: string, variant_sku: string, catalog_product_id: string } | { ok: false, code: string, message: string }>}
 */
async function resolveCatalogVariantForCommerceLine(supabase, line) {
  const parent = normalizeCanonicalUuidInput(
    resolveLineCatalogProductId(line) || line.canonical_product_id || line.product_id,
  );
  if (!parent) {
    return { ok: false, code: 'MISSING_CANONICAL_PRODUCT_ID', message: 'Line is missing catalog_v2 parent product id.' };
  }

  const vid = normalizeCanonicalUuidInput(line.catalog_variant_id);
  if (vid) {
    const { data: v, error } = await supabase
      .schema('catalog_v2')
      .from('catalog_variants')
      .select('id, variant_sku, catalog_product_id')
      .eq('id', vid)
      .eq('is_active', true)
      .maybeSingle();
    if (error) return { ok: false, code: 'VARIANT_QUERY_ERROR', message: error.message };
    if (!v) return { ok: false, code: 'VARIANT_NOT_FOUND', message: 'catalog_variant_id does not match an active catalog variant.' };
    if (String(v.catalog_product_id) !== String(parent)) {
      return {
        ok: false,
        code: 'VARIANT_PARENT_MISMATCH',
        message: 'catalog_variant_id belongs to a different catalog product than this line.',
      };
    }
    const skuCheck = requireVariantSku(v.variant_sku);
    if (!skuCheck.ok) return skuCheck;
    return {
      ok: true,
      catalog_variant_id: String(v.id),
      variant_sku: skuCheck.variant_sku,
      catalog_product_id: parent,
    };
  }

  const sizeRaw = line.size != null && line.size !== '' ? String(line.size).trim() : '';
  if (sizeRaw) {
    const sizeNorm = sizeRaw.toLowerCase();
    const { data: rows, error: e2 } = await supabase
      .schema('catalog_v2')
      .from('catalog_variants')
      .select('id, variant_sku')
      .eq('catalog_product_id', parent)
      .eq('size_code', sizeNorm)
      .eq('is_active', true);
    if (e2) return { ok: false, code: 'VARIANT_QUERY_ERROR', message: e2.message };
    const list = rows || [];
    if (list.length === 0) {
      return {
        ok: false,
        code: 'CATALOG_VARIANT_UNRESOLVED',
        message: 'No active catalog variant matches this product and size.',
      };
    }
    if (list.length > 1) {
      return {
        ok: false,
        code: 'AMBIGUOUS_CATALOG_VARIANT',
        message: 'Multiple active variants match this product and size; send catalog_variant_id explicitly.',
      };
    }
    const v0 = list[0];
    const skuCheck0 = requireVariantSku(v0.variant_sku);
    if (!skuCheck0.ok) return skuCheck0;
    return {
      ok: true,
      catalog_variant_id: String(v0.id),
      variant_sku: skuCheck0.variant_sku,
      catalog_product_id: parent,
    };
  }

  const { data: allRows, error: e3 } = await supabase
    .schema('catalog_v2')
    .from('catalog_variants')
    .select('id, variant_sku')
    .eq('catalog_product_id', parent)
    .eq('is_active', true);
  if (e3) return { ok: false, code: 'VARIANT_QUERY_ERROR', message: e3.message };
  const all = allRows || [];
  if (all.length === 1) {
    const v1 = all[0];
    const skuCheck1 = requireVariantSku(v1.variant_sku);
    if (!skuCheck1.ok) return skuCheck1;
    return {
      ok: true,
      catalog_variant_id: String(v1.id),
      variant_sku: skuCheck1.variant_sku,
      catalog_product_id: parent,
    };
  }

  return {
    ok: false,
    code: 'CATALOG_VARIANT_REQUIRED',
    message:
      'Send catalog_variant_id, or size matching exactly one active variant, or use a single-variant product.',
  };
}

module.exports = { resolveCatalogVariantForCommerceLine };
