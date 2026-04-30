'use strict';

/**
 * Single checkout money path: line pricing, min order, shipping, tax, total.
 * Used by POST /api/checkout/quote, POST /api/orders, POST /api/orders/create-payment-intent.
 */

const commercePricing = require('./commerce-pricing');
const commerceShipping = require('./commerce-shipping');
const taxLib = require('./tax');
const shippingPolicyService = require('../services/shippingPolicyService');
const {
  resolveLineCatalogProductId,
  resolveCartLineListingProductId,
  normalizeCanonicalUuidInput,
} = require('./resolve-canonical-product-id');
const { assertCatalogV2ProductIdForCommerce } = require('./catalog-v2-product-guard');

/**
 * @param {object} params
 * @param {Array} params.cartItems
 * @param {object} params.finalShippingAddress - Normalized address (tax nexus uses state)
 * @param {object|null} params.user
 * @param {number|null} params.companyId
 * @param {object} params.pricingContext
 * @param {object} params.productsService - { getProductById(id, options?) }
 * @returns {Promise<{ ok: true, value: object } | { ok: false, status: number, body: object }>}
 */
async function computeCheckoutMoneyFromCart({
  cartItems,
  finalShippingAddress,
  user,
  companyId,
  pricingContext,
  productsService,
}) {
  if (!cartItems || cartItems.length === 0) {
    return { ok: false, status: 400, body: { error: 'Cart is empty' } };
  }

  let subtotal = 0;
  const orderItems = [];

  for (const item of cartItems) {
    const catalogId = resolveLineCatalogProductId(item);
    if (!catalogId) {
      return {
        ok: false,
        status: 422,
        body: { error: 'Cart line missing canonical_product_id (catalog UUID)', code: 'MISSING_CANONICAL_PRODUCT_ID' },
      };
    }
    try {
      await assertCatalogV2ProductIdForCommerce(catalogId, 'checkout_compute');
    } catch (e) {
      if (e && e.name === 'InvalidCatalogV2ProductIdError') {
        return {
          ok: false,
          status: e.statusCode || 422,
          body: {
            error: e.message,
            code: e.typedCode || 'INVALID_CATALOG_PRODUCT_ID',
            context: e.context,
            product_id: e.product_id,
          },
        };
      }
      throw e;
    }
    const listingId = resolveCartLineListingProductId(item);
    const variantSku = String(item.variant_sku || '').trim();
    if (!variantSku) {
      return {
        ok: false,
        status: 422,
        body: {
          error: 'Cart line missing variant_sku; resolve catalog variant before checkout.',
          code: 'MISSING_VARIANT_SKU',
          canonical_product_id: catalogId,
        },
      };
    }
    const catalogVariantId = normalizeCanonicalUuidInput(item.catalog_variant_id);
    if (!catalogVariantId) {
      return {
        ok: false,
        status: 422,
        body: {
          error: 'Cart line missing catalog_variant_id; resolve catalog variant before checkout.',
          code: 'MISSING_CATALOG_VARIANT_ID',
          canonical_product_id: catalogId,
        },
      };
    }

    let product;
    try {
      product = await productsService.getProductById(listingId || catalogId, {
        variant_sku: variantSku,
        catalog_variant_id: catalogVariantId,
      });
    } catch (e) {
      if (e && e.name === 'AmbiguousSellableForVariantError') {
        return {
          ok: false,
          status: 422,
          body: {
            error: e.message,
            code: e.code || 'AMBIGUOUS_SELLABLE_FOR_VARIANT',
            canonical_product_id: catalogId,
          },
        };
      }
      throw e;
    }
    if (!product) {
      return {
        ok: false,
        status: 400,
        body: { error: 'Product not found', canonical_product_id: catalogId },
      };
    }

    const { unitPrice: price } = commercePricing.resolveLineUnitPriceForCheckout({
      user,
      companyId,
      product,
      quantity: item.quantity,
      pricingContext,
    });
    subtotal += price * item.quantity;

    let costAtOrder = null;
    if (product.cost != null && product.cost !== '') {
      const c = Number(product.cost);
      if (Number.isFinite(c) && c >= 0) costAtOrder = c;
    }

    const line = {
      product_id: catalogId,
      sku: product.sku || '',
      variant_sku: variantSku,
      catalog_variant_id: catalogVariantId,
      name: product.name || 'Unknown',
      size: item.size || null,
      quantity: item.quantity,
      price,
      canonical_product_id: catalogId,
      cost_at_order: costAtOrder,
    };
    if (listingId) line.listing_id = listingId;
    orderItems.push(line);
  }

  const discount = 0;
  const shipCfg = await shippingPolicyService.resolveShippingConfigForCheckout();
  const minCheck = commerceShipping.validateMinimumOrder(subtotal, shipCfg);
  if (!minCheck.ok) {
    return {
      ok: false,
      status: 400,
      body: {
        error: `Minimum order is $${minCheck.minOrderAmount.toFixed(2)}. Add $${minCheck.shortBy.toFixed(2)} more to checkout.`,
        code: 'MIN_ORDER_NOT_MET',
        min_order_amount: minCheck.minOrderAmount,
        subtotal: minCheck.subtotal,
        short_by: minCheck.shortBy,
      },
    };
  }

  const shipping = commerceShipping.computeShippingFromSubtotal(subtotal, shipCfg);
  const taxResult = taxLib.calculateTaxForAddress(finalShippingAddress, subtotal, shipping);
  const tax = taxResult.tax;
  const total = subtotal + shipping + tax;

  return {
    ok: true,
    value: {
      orderItems,
      subtotal,
      discount,
      shipping,
      tax,
      total,
      taxResult,
      shipCfg,
    },
  };
}

module.exports = {
  computeCheckoutMoneyFromCart,
};
