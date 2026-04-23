'use strict';

/**
 * Map gc_commerce order + lines to the legacy Express API shape (dollar totals, items[]).
 */

function minorToDollars(minor) {
  const n = Number(minor);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n) / 100;
}

function dollarsToMinor(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/**
 * @param {object} row - gc_commerce.orders row
 * @param {object} [opts]
 * @param {boolean} [opts.includeLegacyKeys] - user_id mirrors placed_by_user_id for older clients
 */
function normalizeGcOrderHeaderForApi(row, opts = {}) {
  if (!row) return null;
  const includeLegacyKeys = opts.includeLegacyKeys !== false;
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const out = {
    id: row.id,
    company_id: row.company_id,
    placed_by_user_id: row.placed_by_user_id,
    order_number: row.order_number,
    status: row.status,
    currency_code: row.currency_code || 'USD',
    subtotal: minorToDollars(row.subtotal_minor),
    discount: minorToDollars(row.discount_minor),
    shipping: minorToDollars(row.shipping_minor),
    tax: minorToDollars(row.tax_minor),
    total: minorToDollars(row.total_minor),
    shipping_address: row.shipping_address,
    metadata: row.metadata,
    idempotency_key: row.idempotency_key,
    placed_at: row.placed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    stripe_payment_intent_id: row.stripe_payment_intent_id ?? null,
    payment_method: row.payment_method ?? meta.payment_method ?? null,
    payment_confirmed_at: row.payment_confirmed_at ?? null,
    payment_integrity_hold: !!row.payment_integrity_hold,
    payment_integrity_notes: row.payment_integrity_notes ?? null,
    inventory_reserved_at: row.inventory_reserved_at ?? null,
    inventory_released_at: row.inventory_released_at ?? null,
    inventory_deducted_at: row.inventory_deducted_at ?? null,
    marketing_attribution: row.marketing_attribution ?? meta.marketing_attribution ?? null,
    tax_rate: row.tax_rate != null ? Number(row.tax_rate) : meta.tax_rate != null ? Number(meta.tax_rate) : null,
    tax_reason: row.tax_reason ?? meta.tax_reason ?? null,
    notes: meta.notes ?? null,
    ship_to_id: meta.ship_to_id ?? null,
    tracking_number: meta.tracking_number ?? '',
    tracking_url: meta.tracking_url ?? '',
    invoice_status: row.invoice_status ?? null,
    invoice_amount_due: row.invoice_amount_due != null ? Number(row.invoice_amount_due) : null,
    invoice_amount_paid: row.invoice_amount_paid != null ? Number(row.invoice_amount_paid) : 0,
    invoice_due_at: row.invoice_due_at ?? null,
    invoice_terms_code_applied: row.invoice_terms_code_applied ?? null,
    invoice_ar_opened_at: row.invoice_ar_opened_at ?? null,
  };
  if (includeLegacyKeys && row.placed_by_user_id) {
    out.user_id = row.placed_by_user_id;
  }
  return out;
}

/**
 * @param {object[]} lines - gc_commerce.order_lines joined with sellable_products (optional sp)
 * @param {Map<string, object>} [sellableById]
 */
function normalizeGcOrderLinesForApi(lines, sellableById) {
  const map = sellableById || new Map();
  return (lines || []).map((ol) => {
    const sp = ol.sellable_products || map.get(ol.sellable_product_id) || {};
    const snap = ol.product_snapshot && typeof ol.product_snapshot === 'object' ? ol.product_snapshot : {};
    const unit = minorToDollars(ol.unit_price_minor);
    const catalogPid = snap.catalog_product_id || sp.catalog_product_id || null;
    return {
      order_line_id: ol.id,
      order_item_id: snap.legacy_order_item_id != null ? Number(snap.legacy_order_item_id) : null,
      product_id: catalogPid != null ? String(catalogPid) : null,
      quantity: ol.quantity,
      size: snap.size ?? null,
      unit_price: unit,
      canonical_product_id: catalogPid != null ? String(catalogPid) : null,
      sellable_product_id: ol.sellable_product_id,
      product_name: sp.display_name || '',
      name: sp.display_name || '',
      sku: sp.sku || '',
    };
  });
}

module.exports = {
  minorToDollars,
  dollarsToMinor,
  normalizeGcOrderHeaderForApi,
  normalizeGcOrderLinesForApi,
};
