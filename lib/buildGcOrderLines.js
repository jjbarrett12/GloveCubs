'use strict';

const { normalizeCanonicalUuidInput, resolveLineCatalogProductId } = require('./resolve-canonical-product-id');
const { resolveCatalogV2ProductId } = require('./resolve-catalog-v2-product-id');
const { assertCatalogV2ProductIdForCommerce } = require('./catalog-v2-product-guard');
const { dollarsToMinor } = require('./gcOrderNormalize');

/**
 * Resolve line to catalog_v2.catalog_products.id for snapshots and inventory.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ product_id?: string, canonical_product_id?: string, listing_id?: string }} item
 * @returns {Promise<string>}
 */
async function resolveCatalogV2ProductIdForOrderLine(supabase, item) {
  const fromCanon = normalizeCanonicalUuidInput(item.canonical_product_id);
  const fromPid = normalizeCanonicalUuidInput(item.product_id);
  if (fromCanon && fromPid && fromCanon !== fromPid) {
    const err = new Error('order line has mismatched product_id and canonical_product_id');
    err.name = 'MissingCanonicalProductIdError';
    err.context = 'build_gc_order_lines';
    throw err;
  }
  const primary = resolveLineCatalogProductId(item) || fromCanon || fromPid;
  if (!primary) {
    const err = new Error('Missing catalog UUID for checkout line');
    err.name = 'MissingCanonicalProductIdError';
    err.context = 'build_gc_order_lines';
    throw err;
  }

  const { data: asV2, error: v2Err } = await supabase
    .schema('catalog_v2')
    .from('catalog_products')
    .select('id')
    .eq('id', primary)
    .maybeSingle();
  if (v2Err) throw v2Err;
  const v2FromRow = asV2 && asV2.id ? normalizeCanonicalUuidInput(asV2.id) : null;
  if (v2FromRow) return v2FromRow;

  const listing = normalizeCanonicalUuidInput(item.listing_id);
  const catalogosKey = listing || primary;
  return await resolveCatalogV2ProductId(catalogosKey);
}

/**
 * Active sellable row: prefer catalog_product_id = catalog_v2 id, else legacy catalogos listing id.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} catalogV2Id
 * @param {string | null} listingId
 */
async function findActiveSellableProduct(supabase, catalogV2Id, listingId) {
  const q = () =>
    supabase
      .schema('gc_commerce')
      .from('sellable_products')
      .select('id, sku, display_name, catalog_product_id')
      .eq('is_active', true);

  const { data: byV2, error: e1 } = await q().eq('catalog_product_id', catalogV2Id).limit(1).maybeSingle();
  if (e1) throw e1;
  if (byV2) return byV2;

  if (listingId) {
    const { data: byListing, error: e2 } = await q().eq('catalog_product_id', listingId).limit(1).maybeSingle();
    if (e2) throw e2;
    if (byListing) return byListing;
  }

  const err = new Error(
    `No active sellable_products row for catalog_v2 id ${catalogV2Id}` +
      (listingId ? ` or listing id ${listingId}` : ''),
  );
  err.name = 'MissingSellableProductError';
  err.canonicalProductId = catalogV2Id;
  throw err;
}

/**
 * Build gc_commerce.order_lines rows for insert (minor units + product_snapshot).
 * product_snapshot.catalog_product_id is always catalog_v2.catalog_products.id.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - service role
 * @param {string} gcOrderId - uuid
 * @param {Array<{ product_id?: string, quantity?: number, size?: string, unit_price?: number, canonical_product_id?: string, listing_id?: string }>} items
 */
async function buildGcOrderLinesForInsert(supabase, gcOrderId, items) {
  const lines = [];
  let lineNumber = 0;
  for (const item of items || []) {
    lineNumber += 1;
    const qty = Math.max(0, Math.floor(Number(item.quantity) || 0));
    if (qty <= 0) continue;

    const catalogV2Id = await resolveCatalogV2ProductIdForOrderLine(supabase, item);
    await assertCatalogV2ProductIdForCommerce(catalogV2Id, 'build_gc_order_lines');
    const listingId = normalizeCanonicalUuidInput(item.listing_id);
    const sp = await findActiveSellableProduct(supabase, catalogV2Id, listingId);

    const unitDollars = Number(item.unit_price);
    const unitMinor = dollarsToMinor(unitDollars);
    const lineSub = dollarsToMinor(unitDollars * qty);

    lines.push({
      order_id: gcOrderId,
      sellable_product_id: sp.id,
      line_number: lineNumber,
      quantity: qty,
      unit_price_minor: unitMinor,
      line_subtotal_minor: lineSub,
      discount_minor: 0,
      tax_minor: 0,
      total_minor: lineSub,
      product_snapshot: {
        catalog_product_id: catalogV2Id,
        size: item.size != null ? String(item.size) : null,
        sku: sp.sku,
        display_name: sp.display_name,
      },
    });
  }
  return lines;
}

module.exports = { buildGcOrderLinesForInsert };
