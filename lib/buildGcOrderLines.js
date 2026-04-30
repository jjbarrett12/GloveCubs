'use strict';

const { normalizeCanonicalUuidInput, resolveLineCatalogProductId } = require('./resolve-canonical-product-id');
const { resolveCatalogV2ProductId } = require('./resolve-catalog-v2-product-id');
const { assertCatalogV2ProductIdForCommerce } = require('./catalog-v2-product-guard');
const { dollarsToMinor } = require('./gcOrderNormalize');
const { resolveActiveSellableForVariant } = require('./sellable-variant-resolution');

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
 * Build gc_commerce.order_lines rows for insert (minor units + product_snapshot).
 * product_snapshot.catalog_product_id is always catalog_v2.catalog_products.id.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - service role
 * @param {string} gcOrderId - uuid
 * @param {Array<{ product_id?: string, quantity?: number, size?: string, unit_price?: number, canonical_product_id?: string, listing_id?: string, catalog_variant_id?: string, variant_sku?: string }>} items
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

    const catalogVariantId = normalizeCanonicalUuidInput(item.catalog_variant_id);
    const variantSku = item.variant_sku != null ? String(item.variant_sku).trim() : '';
    if (!catalogVariantId || !variantSku) {
      const err = new Error('order item missing catalog_variant_id or variant_sku (checkout must resolve variant first)');
      err.name = 'MissingCatalogVariantForOrderLineError';
      err.context = 'build_gc_order_lines';
      throw err;
    }
    const { data: vRow, error: vErr } = await supabase
      .schema('catalog_v2')
      .from('catalog_variants')
      .select('id, catalog_product_id, variant_sku, is_active')
      .eq('id', catalogVariantId)
      .maybeSingle();
    if (vErr) throw vErr;
    if (!vRow || !vRow.is_active) {
      const err = new Error('catalog_variant_id is missing or inactive');
      err.name = 'InvalidCatalogVariantForOrderLineError';
      err.context = 'build_gc_order_lines';
      throw err;
    }
    if (String(vRow.catalog_product_id) !== String(catalogV2Id)) {
      const err = new Error('catalog_variant_id does not belong to this line catalog product');
      err.name = 'CatalogVariantParentMismatchError';
      err.context = 'build_gc_order_lines';
      throw err;
    }
    if (String(vRow.variant_sku || '').trim() !== variantSku) {
      const err = new Error('variant_sku does not match catalog_variants row for catalog_variant_id');
      err.name = 'CatalogVariantSkuMismatchError';
      err.context = 'build_gc_order_lines';
      throw err;
    }

    const sp = await resolveActiveSellableForVariant(supabase, {
      catalog_product_id: catalogV2Id,
      catalog_variant_id: catalogVariantId,
      variant_sku: variantSku,
      listing_id: listingId || null,
    });

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
      catalog_variant_id: catalogVariantId,
      product_snapshot: {
        catalog_product_id: catalogV2Id,
        size: item.size != null ? String(item.size) : null,
        sku: variantSku,
        sellable_sku: sp.sku,
        display_name: sp.display_name,
        variant_sku: variantSku,
      },
    });
  }
  return lines;
}

module.exports = { buildGcOrderLinesForInsert };
