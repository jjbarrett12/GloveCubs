'use strict';

/**
 * Resolve COGS for one order line: prefer persisted snapshot, else live catalog product cost map (UUID-keyed).
 */

const { normalizeCanonicalUuidInput } = require('./resolve-canonical-product-id');

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * Map a gc_commerce.order_lines row to the shape expected by resolveLineCogs.
 * Net line revenue uses (line_subtotal_minor − discount_minor) in USD.
 */
function gcOrderLineToLegacyCogsShape(ol) {
  const snap = ol.product_snapshot && typeof ol.product_snapshot === 'object' ? ol.product_snapshot : {};
  const qty = Number(ol.quantity) || 0;
  const subM = Number(ol.line_subtotal_minor) || 0;
  const discM = Number(ol.discount_minor) || 0;
  const netMinor = Math.max(0, subM - discM);
  const unitPrice = qty > 0 ? round2(netMinor / 100 / qty) : 0;
  const canon = normalizeCanonicalUuidInput(snap.catalog_product_id);
  return {
    quantity: qty,
    unit_price: unitPrice,
    catalog_product_id: canon,
    unit_cost_at_order: snap.unit_cost_at_order,
    total_cost_at_order: snap.total_cost_at_order,
  };
}

function resolveLineCogsGc(ol, costByCatalogProductId) {
  return resolveLineCogs(gcOrderLineToLegacyCogsShape(ol), costByCatalogProductId);
}

/**
 * @param {object} line — normalized line (from gcOrderLineToLegacyCogsShape or legacy order_items shape)
 * @param {Map<string, number|null>} costByCatalogProductId — attrs.unit_cost from catalogos.products by id (lowercase UUID)
 * @returns {{ cogs: number|null, source: 'snapshot_total'|'snapshot_unit'|'current_product'|null }}
 */
function resolveLineCogs(line, costByCatalogProductId) {
  const qty = Number(line.quantity) || 0;

  const totalSnap = line.total_cost_at_order;
  if (totalSnap != null && totalSnap !== '') {
    const t = Number(totalSnap);
    if (Number.isFinite(t) && t >= 0) {
      return { cogs: round2(t), source: 'snapshot_total' };
    }
  }

  const unitSnap = line.unit_cost_at_order;
  if (unitSnap != null && unitSnap !== '') {
    const u = Number(unitSnap);
    if (Number.isFinite(u) && u >= 0 && qty > 0) {
      return { cogs: round2(qty * u), source: 'snapshot_unit' };
    }
  }

  const canon =
    normalizeCanonicalUuidInput(line.catalog_product_id) ||
    normalizeCanonicalUuidInput(line.canonical_product_id);
  if (!canon) return { cogs: null, source: null };
  const c = costByCatalogProductId.get(canon);
  if (c == null || !Number.isFinite(c)) return { cogs: null, source: null };
  return { cogs: round2(qty * c), source: 'current_product' };
}

module.exports = {
  resolveLineCogs,
  resolveLineCogsGc,
  gcOrderLineToLegacyCogsShape,
  round2,
};
