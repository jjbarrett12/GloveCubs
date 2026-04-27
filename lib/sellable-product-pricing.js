'use strict';

const { minorToDollars } = require('./gcOrderNormalize');

class MissingSellablePricingError extends Error {
  /**
   * @param {string} catalogProductId
   * @param {string} [detail]
   */
  constructor(catalogProductId, detail) {
    const id = catalogProductId != null ? String(catalogProductId) : '';
    const msg =
      detail ||
      `Active gc_commerce.sellable_products row with non-null list_price_minor is required for catalog_product_id=${id}`;
    super(msg);
    this.name = 'MissingSellablePricingError';
    this.code = 'MISSING_SELLABLE_PRICING';
    this.catalog_product_id = id;
  }
}

/**
 * @param {object|null|undefined} sellableRow
 * @param {string} catalogProductId
 */
function assertSellableListPriceMinor(sellableRow, catalogProductId) {
  if (!sellableRow) {
    throw new MissingSellablePricingError(catalogProductId);
  }
  const m = sellableRow.list_price_minor;
  if (m == null || !Number.isFinite(Number(m))) {
    throw new MissingSellablePricingError(catalogProductId, 'sellable_products.list_price_minor is null or invalid');
  }
}

/**
 * @param {object} sellableRow - gc_commerce.sellable_products row
 * @returns {{ price: number, list_price: number, bulk_price: number|null, cost: number|null }}
 */
function pricingDollarsFromSellableRow(sellableRow) {
  const catalogProductId =
    sellableRow && sellableRow.catalog_product_id != null ? String(sellableRow.catalog_product_id) : '';
  assertSellableListPriceMinor(sellableRow, catalogProductId);
  const list = minorToDollars(sellableRow.list_price_minor);
  if (!Number.isFinite(list) || list < 0) {
    throw new MissingSellablePricingError(catalogProductId, 'Invalid list_price_minor');
  }
  let bulk = null;
  if (sellableRow.bulk_price_minor != null && Number.isFinite(Number(sellableRow.bulk_price_minor))) {
    bulk = minorToDollars(sellableRow.bulk_price_minor);
  }
  let cost = null;
  if (sellableRow.unit_cost_minor != null && Number.isFinite(Number(sellableRow.unit_cost_minor))) {
    cost = minorToDollars(sellableRow.unit_cost_minor);
  }
  return {
    price: list,
    list_price: list,
    bulk_price: bulk,
    cost,
  };
}

module.exports = {
  MissingSellablePricingError,
  assertSellableListPriceMinor,
  pricingDollarsFromSellableRow,
};
