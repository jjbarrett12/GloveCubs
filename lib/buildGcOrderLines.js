'use strict';

const { normalizeCanonicalUuidInput } = require('./resolve-canonical-product-id');
const { dollarsToMinor } = require('./gcOrderNormalize');

/**
 * Build gc_commerce.order_lines rows for insert (minor units + product_snapshot).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - service role
 * @param {string} gcOrderId - uuid
 * @param {Array<{ product_id?: string, quantity?: number, size?: string, unit_price?: number, canonical_product_id?: string }>} items
 */
async function buildGcOrderLinesForInsert(supabase, gcOrderId, items) {
  const lines = [];
  let lineNumber = 0;
  for (const item of items || []) {
    lineNumber += 1;
    const qty = Math.max(0, Math.floor(Number(item.quantity) || 0));
    if (qty <= 0) continue;

    const canon = normalizeCanonicalUuidInput(item.canonical_product_id);
    if (!canon) {
      const err = new Error(`Missing catalog UUID for checkout line`);
      err.name = 'MissingCanonicalProductIdError';
      err.context = 'build_gc_order_lines';
      throw err;
    }

    const { data: sp, error: spErr } = await supabase
      .schema('gc_commerce')
      .from('sellable_products')
      .select('id, sku, display_name, catalog_product_id')
      .eq('catalog_product_id', canon)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (spErr) throw spErr;
    if (!sp) {
      const err = new Error(`No active sellable_products row for catalog_product_id ${canon}`);
      err.name = 'MissingSellableProductError';
      err.canonicalProductId = canon;
      throw err;
    }

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
        catalog_product_id: canon,
        size: item.size != null ? String(item.size) : null,
        sku: sp.sku,
        display_name: sp.display_name,
      },
    });
  }
  return lines;
}

module.exports = { buildGcOrderLinesForInsert };
