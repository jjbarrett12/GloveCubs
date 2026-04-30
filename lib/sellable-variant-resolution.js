'use strict';

const GC = 'gc_commerce';

class AmbiguousSellableForVariantError extends Error {
  constructor(message, code = 'AMBIGUOUS_SELLABLE_FOR_VARIANT') {
    super(message);
    this.name = 'AmbiguousSellableForVariantError';
    this.code = code;
  }
}

/**
 * Listing / PLP: deterministic sellable when no variant is selected.
 * - 0 rows → null
 * - 1 row → that row
 * - multiple → lexicographically first by sku (explicit tie-break; not a variant match)
 * @param {object[]} rows
 * @returns {object|null}
 */
function pickSellableForListing(rows) {
  const list = (rows || []).filter(Boolean);
  if (list.length === 0) return null;
  if (list.length === 1) return list[0];
  return list.slice().sort((a, b) => String(a.sku || '').localeCompare(String(b.sku || '')))[0];
}

/**
 * Checkout / order lines: variant-aware rules.
 * 1) Prefer sellable where sku === variant_sku (trimmed).
 * 2) Else exactly one active row for parent → legacy fallback.
 * 3) Else multiple rows and none matched → hard error (no guess).
 * @param {object[]} rows
 * @param {string} variantSku
 * @returns {object}
 */
function pickSellableForCheckoutLine(rows, variantSku) {
  const list = (rows || []).filter(Boolean);
  const vs = variantSku != null ? String(variantSku).trim() : '';
  if (!vs) {
    const err = new Error('pickSellableForCheckoutLine requires variant_sku');
    err.name = 'MissingVariantSkuForSellableError';
    throw err;
  }
  if (list.length === 0) {
    const err = new Error('No active sellable_products rows for catalog product');
    err.name = 'MissingSellableProductError';
    throw err;
  }
  const exact = list.filter((r) => String(r.sku || '').trim() === vs);
  if (exact.length >= 1) return exact[0];
  if (list.length === 1) return list[0];
  throw new AmbiguousSellableForVariantError(
    `Multiple active sellables for catalog product; none has sku matching variant_sku "${vs}"`,
    'AMBIGUOUS_SELLABLE_FOR_VARIANT',
  );
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} catalogProductId
 */
async function fetchSellableRowsForCatalogProduct(supabase, catalogProductId) {
  const cid = String(catalogProductId || '').trim();
  if (!cid) return [];
  const { data, error } = await supabase
    .schema(GC)
    .from('sellable_products')
    .select('id, sku, display_name, catalog_product_id, list_price_minor, bulk_price_minor, unit_cost_minor, is_active')
    .eq('catalog_product_id', cid)
    .eq('is_active', true);
  if (error) throw error;
  return data || [];
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string[]} catalogIds
 * @returns {Promise<Map<string, object[]>>}
 */
async function fetchActiveSellableRowsByCatalogIds(supabase, catalogIds) {
  const ids = [...new Set((catalogIds || []).filter(Boolean).map((id) => String(id)))];
  const m = new Map();
  if (ids.length === 0) return m;
  const { data, error } = await supabase
    .schema(GC)
    .from('sellable_products')
    .select('id, sku, display_name, catalog_product_id, list_price_minor, bulk_price_minor, unit_cost_minor, is_active')
    .in('catalog_product_id', ids)
    .eq('is_active', true);
  if (error) throw error;
  for (const r of data || []) {
    const cid = r.catalog_product_id != null ? String(r.catalog_product_id) : '';
    if (!cid) continue;
    const arr = m.get(cid) || [];
    arr.push(r);
    m.set(cid, arr);
  }
  return m;
}

/**
 * Resolve active sellable for a checkout/order line (variant required).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ catalog_product_id: string, catalog_variant_id?: string|null, variant_sku: string, listing_id?: string|null }} params
 */
async function resolveActiveSellableForVariant(supabase, params) {
  const catalogProductId = String(params.catalog_product_id || '').trim();
  const variantSku = params.variant_sku;
  let rows = await fetchSellableRowsForCatalogProduct(supabase, catalogProductId);
  const listingId = params.listing_id != null ? String(params.listing_id).trim() : '';
  if (rows.length === 0 && listingId) {
    rows = await fetchSellableRowsForCatalogProduct(supabase, listingId);
  }
  if (rows.length === 0) {
    const err = new Error(
      `No active sellable_products row for catalog_v2 id ${catalogProductId}` + (listingId ? ` or listing id ${listingId}` : ''),
    );
    err.name = 'MissingSellableProductError';
    err.canonicalProductId = catalogProductId;
    throw err;
  }
  return pickSellableForCheckoutLine(rows, variantSku);
}

module.exports = {
  AmbiguousSellableForVariantError,
  pickSellableForListing,
  pickSellableForCheckoutLine,
  fetchSellableRowsForCatalogProduct,
  fetchActiveSellableRowsByCatalogIds,
  resolveActiveSellableForVariant,
};
