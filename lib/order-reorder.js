'use strict';

const commercePricing = require('./commerce-pricing');
const {
  resolveLineCatalogProductId,
  normalizeCanonicalUuidInput,
} = require('./resolve-canonical-product-id');
const { resolveCatalogVariantForCommerceLine } = require('./resolve-cart-catalog-variant');
const { getSupabaseAdmin } = require('./supabaseAdmin');

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
 * @returns {Promise<Array<{ order_item_id: *, product_id: string|null, size: string|null, canonical_product_id: string|null, catalog_variant_id: string|null, quantity_ordered: number, name: string, sku: string, variant_sku: string, last_unit_price: number, current_unit_price: number|null, status: string, reason: string|null, price_change_percent: number|null }>>}
 */
async function buildReorderPreviews(orderItems, user, companyId, pricingContext, productsService) {
  const supabase = getSupabaseAdmin();
  const out = [];
  for (const item of orderItems || []) {
    const catalogId = resolveLineCatalogProductId(item);
    if (!catalogId) {
      out.push({
        order_item_id: item.order_item_id,
        product_id: null,
        size: normSize(item.size),
        canonical_product_id: null,
        catalog_variant_id: null,
        quantity_ordered: Math.max(1, parseInt(item.quantity, 10) || 1),
        name: item.product_name || item.name || 'Item',
        sku: item.sku || '',
        variant_sku: '',
        last_unit_price: Number.isFinite(Number(item.unit_price)) ? Number(item.unit_price) : 0,
        current_unit_price: null,
        status: 'unavailable',
        reason: 'Order line is missing catalog product id.',
        price_change_percent: null,
      });
      continue;
    }
    const lastUnit = Number(item.unit_price);
    const lastOk = Number.isFinite(lastUnit) ? lastUnit : 0;
    let status = 'available';
    let reason = null;

    let catalogVariantId = normalizeCanonicalUuidInput(item.catalog_variant_id);
    let variantSku = item.variant_sku != null ? String(item.variant_sku).trim() : '';

    if (catalogVariantId && variantSku) {
      const { data: vRow, error: vErr } = await supabase
        .schema('catalog_v2')
        .from('catalog_variants')
        .select('id, variant_sku, catalog_product_id, is_active')
        .eq('id', catalogVariantId)
        .maybeSingle();
      if (vErr || !vRow || !vRow.is_active) {
        status = 'unavailable';
        reason = 'Saved catalog variant is missing or inactive.';
      } else if (String(vRow.catalog_product_id) !== String(catalogId)) {
        status = 'unavailable';
        reason = 'Saved catalog variant does not match this product.';
      } else if (String(vRow.variant_sku || '').trim() !== variantSku) {
        status = 'unavailable';
        reason = 'Order snapshot variant_sku does not match catalog variant.';
      }
    } else {
      const vr = await resolveCatalogVariantForCommerceLine(supabase, {
        product_id: catalogId,
        canonical_product_id: catalogId,
        size: item.size,
        catalog_variant_id: catalogVariantId || undefined,
      });
      if (!vr.ok) {
        status = 'unavailable';
        reason = vr.message || vr.code || 'Could not resolve catalog variant for reorder.';
      } else {
        catalogVariantId = vr.catalog_variant_id;
        variantSku = vr.variant_sku;
      }
    }

    let product = null;
    if (status === 'available' && variantSku) {
      try {
        product = await productsService.getProductById(catalogId, {
          variant_sku: variantSku,
          catalog_variant_id: catalogVariantId,
        });
      } catch (e) {
        if (e && e.name === 'AmbiguousSellableForVariantError') {
          status = 'unavailable';
          reason = e.message;
        } else {
          throw e;
        }
      }
      if (status === 'available' && !product) {
        status = 'unavailable';
        reason = 'Product is no longer in the catalog';
      } else if (status === 'available' && product && !product.in_stock) {
        status = 'unavailable';
        reason = 'Currently out of stock';
      }
    }

    let currentUnitPrice = null;
    if (product && status === 'available') {
      const r = commercePricing.resolveLineUnitPriceForCheckout({
        user,
        companyId,
        product,
        quantity: item.quantity,
        pricingContext,
      });
      currentUnitPrice = r.unitPrice;
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
      catalog_variant_id: catalogVariantId || null,
      quantity_ordered: Math.max(1, parseInt(item.quantity, 10) || 1),
      name: item.product_name || item.name || product?.name || 'Item',
      sku: item.sku || product?.sku || '',
      variant_sku: variantSku || '',
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
 * Resolve client reorder lines against previews.
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
    const rVid = normalizeCanonicalUuidInput(r.catalog_variant_id);
    const qty = Math.max(1, Math.min(99999, parseInt(r.quantity, 10) || 1));
    let preview = null;
    if (rVid) {
      preview = previews.find((p) => normalizeCanonicalUuidInput(p.catalog_variant_id) === rVid);
    } else {
      preview = previews.find(
        (p) => String(resolveLineCatalogProductId(p) || '') === String(pid || '') && normSize(p.size) === size,
      );
    }
    if (!preview) {
      return {
        ok: false,
        error: `Invalid line: product ${pid || '?'}${rVid ? ` variant ${rVid}` : size ? ` size ${size}` : ''} is not on this order`,
      };
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
