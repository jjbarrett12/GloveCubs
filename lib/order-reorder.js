'use strict';

const commercePricing = require('./commerce-pricing');
const { resolveLineCatalogProductId } = require('./resolve-canonical-product-id');

function normSize(s) {
  if (s == null || s === '') return null;
  return String(s).trim();
}

function lineKey(productId, size, canonicalId) {
  const canon = resolveLineCatalogProductId({ product_id: productId, canonical_product_id: canonicalId });
  return `${canon || ''}|${normSize(size) || ''}`;
}

/**
 * @param {Array} orderItems enriched items (catalog UUID on product_id / canonical_product_id, quantity, size, …)
 * @returns {Promise<Array<{ order_item_id: *, product_id: string|null, size: string|null, canonical_product_id: string|null, quantity_ordered: number, name: string, sku: string, variant_sku: string, last_unit_price: number, current_unit_price: number|null, status: string, reason: string|null, price_change_percent: number|null }>>}
 */
async function buildReorderPreviews(orderItems, user, companyId, pricingContext, productsService) {
  const out = [];
  for (const item of orderItems || []) {
    const catalogId = resolveLineCatalogProductId(item);
    const product = catalogId ? await productsService.getProductById(catalogId) : null;
    const lastUnit = Number(item.unit_price);
    const lastOk = Number.isFinite(lastUnit) ? lastUnit : 0;
    let status = 'available';
    let reason = null;
    if (!product) {
      status = 'unavailable';
      reason = 'Product is no longer in the catalog';
    } else if (!product.in_stock) {
      status = 'unavailable';
      reason = 'Currently out of stock';
    }

    let currentUnitPrice = null;
    let variantSku = product?.sku || item.sku || '';
    if (product && status === 'available') {
      const r = commercePricing.resolveLineUnitPriceForCheckout({
        user,
        companyId,
        product,
        quantity: item.quantity,
        pricingContext,
      });
      currentUnitPrice = r.unitPrice;
      if (item.size && product.sku) {
        variantSku = `${product.sku}-${String(item.size).toUpperCase().replace(/\s+/g, '')}`;
      }
    } else {
      if (item.size && (item.sku || product?.sku)) {
        const base = item.sku || product?.sku || '';
        variantSku = base ? `${base}-${String(item.size).toUpperCase().replace(/\s+/g, '')}` : String(item.size);
      }
    }

    let priceChangePercent = null;
    if (currentUnitPrice != null && lastOk > 0) {
      priceChangePercent = Math.round(((currentUnitPrice - lastOk) / lastOk) * 10000) / 100;
    }

    out.push({
      order_item_id: item.order_item_id,
      product_id: catalogId,
      size: normSize(item.size),
      canonical_product_id: catalogId,
      quantity_ordered: Math.max(1, parseInt(item.quantity, 10) || 1),
      name: item.product_name || item.name || product?.name || 'Item',
      sku: item.sku || product?.sku || '',
      variant_sku: variantSku,
      last_unit_price: lastOk,
      current_unit_price: currentUnitPrice,
      status,
      reason,
      price_change_percent: priceChangePercent,
    });
  }
  return out;
}

/**
 * Resolve client reorder lines against previews (same product_id + size as on order).
 * @returns {{ ok: true, adds: Array<{ preview: object, quantity: number }> } | { ok: false, error: string }}
 */
function resolveReorderSelections(previews, requestedLines) {
  if (!requestedLines || requestedLines.length === 0) {
    const adds = previews.filter((p) => p.status === 'available').map((p) => ({ preview: p, quantity: p.quantity_ordered }));
    return { ok: true, adds, mode: 'all_available' };
  }
  const adds = [];
  for (const r of requestedLines) {
    const pid = resolveLineCatalogProductId(r);
    const size = normSize(r.size);
    const qty = Math.max(1, Math.min(99999, parseInt(r.quantity, 10) || 1));
    const preview = previews.find(
      (p) => String(resolveLineCatalogProductId(p) || '') === String(pid || '') && normSize(p.size) === size,
    );
    if (!preview) {
      return { ok: false, error: `Invalid line: product ${pid || '?'}${size ? ` size ${size}` : ''} is not on this order` };
    }
    if (preview.status !== 'available') {
      return { ok: false, error: `Cannot add ${preview.name}: ${preview.reason || 'unavailable'}` };
    }
    adds.push({ preview, quantity: qty });
  }
  return { ok: true, adds, mode: 'selected' };
}

module.exports = {
  buildReorderPreviews,
  resolveReorderSelections,
  lineKey,
  normSize,
};
