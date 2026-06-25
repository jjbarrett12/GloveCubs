'use strict';

/**
 * Phase 0C: variant-grain inventory checks (catalog_v2.variant_inventory).
 * Authority: VARIANT_INVENTORY_AUTHORITY=1. Shadow: VARIANT_INVENTORY_SHADOW=1.
 */

const { normalizeCanonicalUuidInput, resolveLineCatalogProductId } = require('./resolve-canonical-product-id');
const { getSupabaseAdmin, isSupabaseAdminConfigured } = require('./supabaseAdmin');

const DEFAULT_LOCATION_CODE = 'default';
const SHADOW_TAG = '[GC_VARIANT_INVENTORY_SHADOW]';
const DELTA_ALERT_UNITS = 1;

function isVariantInventoryAuthorityEnabled() {
  const v = process.env.VARIANT_INVENTORY_AUTHORITY;
  if (v === '0' || v === 'off' || String(v || '').toLowerCase() === 'false' || String(v || '').toLowerCase() === 'no') {
    return false;
  }
  return v === '1' || v === 'true' || String(v || '').toLowerCase() === 'yes' || String(v || '').toLowerCase() === 'on';
}

function isVariantInventoryShadowEnabled() {
  const v = process.env.VARIANT_INVENTORY_SHADOW;
  return v === '1' || v === 'true' || String(v || '').toLowerCase() === 'yes';
}

/**
 * @param {Record<string, unknown>} payload
 */
function logVariantInventoryShadow(payload) {
  try {
    console.warn(SHADOW_TAG, JSON.stringify({ ...payload, ts: new Date().toISOString() }));
  } catch (_) {
    console.warn(SHADOW_TAG, payload);
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} catalogVariantId
 * @param {string} [locationCode]
 */
async function getVariantInventoryRow(supabase, catalogVariantId, locationCode = DEFAULT_LOCATION_CODE) {
  const vid = normalizeCanonicalUuidInput(catalogVariantId);
  if (!vid) return null;
  const loc = String(locationCode || DEFAULT_LOCATION_CODE).trim() || DEFAULT_LOCATION_CODE;
  const { data, error } = await supabase
    .schema('catalog_v2')
    .from('variant_inventory')
    .select('catalog_variant_id, location_code, quantity_on_hand, quantity_reserved')
    .eq('catalog_variant_id', vid)
    .eq('location_code', loc)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * @param {Record<string, unknown>|null|undefined} row
 */
function stockFromVariantRow(row) {
  if (!row) return null;
  const onHand = Number(row.quantity_on_hand) || 0;
  const reserved = Number(row.quantity_reserved) || 0;
  return {
    catalog_variant_id: String(row.catalog_variant_id),
    location_code: String(row.location_code || DEFAULT_LOCATION_CODE),
    stock_on_hand: onHand,
    stock_reserved: reserved,
    available_stock: Math.max(0, onHand - reserved),
  };
}

/**
 * @param {{ catalog_variant_id?: unknown, location_code?: unknown }} item
 * @param {import('@supabase/supabase-js').SupabaseClient} [supabase]
 */
async function getVariantStockForLineItem(item, supabase) {
  const client = supabase || (isSupabaseAdminConfigured() ? getSupabaseAdmin() : null);
  if (!client) return null;
  const vid = normalizeCanonicalUuidInput(item && item.catalog_variant_id);
  if (!vid) return null;
  const loc =
    item && item.location_code != null && String(item.location_code).trim() !== ''
      ? String(item.location_code).trim()
      : DEFAULT_LOCATION_CODE;
  const row = await getVariantInventoryRow(client, vid, loc);
  return stockFromVariantRow(row);
}

/**
 * @param {Array<{ quantity?: unknown, catalog_variant_id?: unknown, canonical_product_id?: unknown, location_code?: unknown }>} items
 * @param {{ failClosed?: boolean }} [opts]
 */
async function checkVariantAvailability(items, opts = {}) {
  const failClosed = opts.failClosed !== false && isVariantInventoryAuthorityEnabled();
  const supabase = isSupabaseAdminConfigured() ? getSupabaseAdmin() : null;
  if (!supabase) {
    return { ok: !failClosed, insufficient: failClosed ? [{ code: 'SUPABASE_UNAVAILABLE' }] : [] };
  }

  const insufficient = [];
  for (const item of items || []) {
    const needed = Number(item.quantity) || 0;
    if (needed <= 0) continue;

    const vid = normalizeCanonicalUuidInput(item.catalog_variant_id);
    if (!vid) {
      if (failClosed) {
        insufficient.push({
          code: 'MISSING_CATALOG_VARIANT_ID',
          canonical_product_id: normalizeCanonicalUuidInput(resolveLineCatalogProductId(item)),
          needed,
          available: 0,
        });
      }
      continue;
    }

    const stock = await getVariantStockForLineItem(item, supabase);
    if (!stock) {
      if (failClosed) {
        insufficient.push({
          code: 'MISSING_VARIANT_INVENTORY',
          catalog_variant_id: vid,
          location_code: DEFAULT_LOCATION_CODE,
          needed,
          available: 0,
        });
      }
      continue;
    }

    if (stock.available_stock < needed) {
      insufficient.push({
        code: 'INSUFFICIENT_VARIANT_STOCK',
        catalog_variant_id: vid,
        location_code: stock.location_code,
        needed,
        available: stock.available_stock,
      });
    }
  }

  return { ok: insufficient.length === 0, insufficient };
}

/**
 * Shadow parent vs variant available units (never throws).
 *
 * @param {object} params
 * @param {object} params.item - cart/order line
 * @param {number|null} params.parentAvailable
 * @param {string} [params.flow]
 */
async function shadowCompareVariantInventoryLine(params) {
  if (!isVariantInventoryShadowEnabled() || !isSupabaseAdminConfigured()) return;

  const item = params.item || {};
  const needed = Number(item.quantity) || 0;
  const vid = normalizeCanonicalUuidInput(item.catalog_variant_id);
  const canon = normalizeCanonicalUuidInput(resolveLineCatalogProductId(item));

  try {
    const variantStock = vid ? await getVariantStockForLineItem(item) : null;
    const variantAvail = variantStock ? variantStock.available_stock : null;
    const parentAvail = params.parentAvailable != null ? Number(params.parentAvailable) : null;

    const variantMissing = vid && variantStock == null;
    const delta =
      parentAvail != null && variantAvail != null ? variantAvail - parentAvail : null;
    const absDelta = delta != null ? Math.abs(delta) : null;

    if (
      variantMissing ||
      (absDelta != null && absDelta >= DELTA_ALERT_UNITS) ||
      (variantAvail != null && needed > 0 && variantAvail < needed && parentAvail != null && parentAvail >= needed)
    ) {
      logVariantInventoryShadow({
        flow: params.flow || 'unknown',
        catalog_variant_id: vid,
        canonical_product_id: canon,
        quantity: needed,
        parent_available: parentAvail,
        variant_available: variantAvail,
        delta_available: delta,
        variant_inventory_missing: variantMissing,
        recommendation: variantMissing
          ? 'Backfill catalog_v2.variant_inventory before enabling VARIANT_INVENTORY_AUTHORITY'
          : 'Parent and variant QOH diverge — reconcile before cutover',
      });
    }
  } catch (err) {
    logVariantInventoryShadow({
      flow: params.flow || 'unknown',
      catalog_variant_id: vid,
      error: err && err.message ? err.message : String(err),
    });
  }
}

/**
 * @param {Array<{ quantity?: unknown, catalog_variant_id?: unknown, location_code?: unknown }>} items
 */
function mapItemsForVariantReserveRpc(items) {
  return (items || [])
    .map((item) => ({
      quantity: Number(item.quantity) || 0,
      catalog_variant_id: normalizeCanonicalUuidInput(item.catalog_variant_id) || null,
      location_code:
        item.location_code != null && String(item.location_code).trim() !== ''
          ? String(item.location_code).trim()
          : DEFAULT_LOCATION_CODE,
    }))
    .filter((row) => row.quantity > 0 && row.catalog_variant_id);
}

module.exports = {
  DEFAULT_LOCATION_CODE,
  SHADOW_TAG,
  DELTA_ALERT_UNITS,
  isVariantInventoryAuthorityEnabled,
  isVariantInventoryShadowEnabled,
  getVariantInventoryRow,
  getVariantStockForLineItem,
  checkVariantAvailability,
  shadowCompareVariantInventoryLine,
  mapItemsForVariantReserveRpc,
  logVariantInventoryShadow,
};
