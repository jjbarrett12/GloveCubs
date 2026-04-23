'use strict';

/**
 * Single checkout money path: line pricing, min order, shipping, tax, total.
 * Used by POST /api/checkout/quote, POST /api/orders, POST /api/orders/create-payment-intent.
 */

const commercePricing = require('./commerce-pricing');
const commerceShipping = require('./commerce-shipping');
const taxLib = require('./tax');
const shippingPolicyService = require('../services/shippingPolicyService');
const { resolveLineCatalogProductId } = require('./resolve-canonical-product-id');

/**
 * @param {object} params
 * @param {Array} params.cartItems
 * @param {object} params.finalShippingAddress - Normalized address (tax nexus uses state)
 * @param {object|null} params.user
 * @param {number|null} params.companyId
 * @param {object} params.pricingContext
 * @param {object} params.productsService - { getProductById(id) }
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
    const product = await productsService.getProductById(catalogId);
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

    let variantSku = product.sku || '';
    if (item.size && product.sku) {
      variantSku = `${product.sku}-${item.size.toUpperCase().replace(/\s+/g, '')}`;
    }

    let costAtOrder = null;
    if (product.cost != null && product.cost !== '') {
      const c = Number(product.cost);
      if (Number.isFinite(c) && c >= 0) costAtOrder = c;
    }

    orderItems.push({
      product_id: catalogId,
      sku: product.sku || '',
      variant_sku: variantSku,
      name: product.name || 'Unknown',
      size: item.size || null,
      quantity: item.quantity,
      price,
      canonical_product_id: catalogId,
      cost_at_order: costAtOrder,
    });
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
