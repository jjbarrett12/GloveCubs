'use strict';

/**
 * Canonical order field for shipping amount on persisted orders is `shipping`.
 * `shipping_cost` is a legacy / mistaken alias used only for reads (e.g. older code paths).
 *
 * Shipping dollars are set at order creation (POST /api/orders, create-payment-intent) using
 * lib/commerce-shipping.js (FREE_SHIPPING_THRESHOLD, FLAT_SHIPPING_RATE). Invoices display that
 * stored value; they do not recompute rules from env.
 */

const TOTAL_EPSILON = 0.005;

function roundMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

function getOrderShippingAmount(order) {
  if (order == null) return 0;
  if (order.shipping != null && Number.isFinite(Number(order.shipping))) {
    return roundMoney(Number(order.shipping));
  }
  if (order.shipping_cost != null && Number.isFinite(Number(order.shipping_cost))) {
    return roundMoney(Number(order.shipping_cost));
  }
  return 0;
}

function sumItemsSubtotal(items) {
  if (!items || !items.length) return 0;
  return roundMoney(
    items.reduce((sum, item) => {
      const qty = Number(item.quantity) || 0;
      const unit =
        item.unit_price != null && Number.isFinite(Number(item.unit_price))
          ? Number(item.unit_price)
          : Number(item.price) || 0;
      return sum + qty * unit;
    }, 0)
  );
}

/**
 * Subtotal shown on invoice: prefer persisted order.subtotal (what was charged), else sum of lines.
 */
function getInvoiceSubtotalForDisplay(order, items) {
  if (order.subtotal != null && Number.isFinite(Number(order.subtotal))) {
    return roundMoney(Number(order.subtotal));
  }
  return sumItemsSubtotal(items);
}

/**
 * Canonical persisted-order money read model (invoice + transactional email).
 *
 * Field precedence (must stay aligned across invoice JSON/PDF and emails):
 * - subtotal: order.subtotal if finite; else sum of line unit_price (or price) × quantity
 * - shipping: order.shipping if finite; else order.shipping_cost if finite (legacy); else 0
 * - tax: order.tax numeric, else 0
 * - discount: order.discount numeric, else 0
 * - computedTotal: subtotal + shipping + tax − discount (audit / validation)
 * - persistedTotal: order.total only when finite; otherwise null — never infer for “grand total” in email
 *
 * @param {object|null} order
 * @param {Array} items order line items (same as invoice)
 * @returns {{ subtotal: number, shipping: number, tax: number, discount: number, computedTotal: number, persistedTotal: number|null }}
 */
function buildOrderMoneyReadModel(order, items) {
  const subtotal = getInvoiceSubtotalForDisplay(order, items);
  const shipping = getOrderShippingAmount(order);
  const tax = roundMoney(Number(order?.tax || 0));
  const discount = roundMoney(Number(order?.discount || 0));
  const computedTotal = roundMoney(subtotal + shipping + tax - discount);
  const persistedTotal =
    order != null && order.total != null && Number.isFinite(Number(order.total))
      ? roundMoney(Number(order.total))
      : null;
  return { subtotal, shipping, tax, discount, computedTotal, persistedTotal };
}

/**
 * @returns {{ subtotal: number, shipping: number, tax: number, discount: number, computedTotal: number, orderTotal: number }}
 */
function computeInvoiceTotalsForDisplay(order, items) {
  const m = buildOrderMoneyReadModel(order, items);
  const orderTotal = m.persistedTotal != null ? m.persistedTotal : m.computedTotal;
  return {
    subtotal: m.subtotal,
    shipping: m.shipping,
    tax: m.tax,
    discount: m.discount,
    computedTotal: m.computedTotal,
    orderTotal,
  };
}

/**
 * Ensures subtotal + shipping + tax - discount matches persisted order.total (within a cent).
 */
function validateInvoiceTotalsMatchOrder(order, totals) {
  if (order.total == null || !Number.isFinite(Number(order.total))) {
    return { ok: true };
  }
  const diff = Math.abs(totals.computedTotal - totals.orderTotal);
  if (diff > TOTAL_EPSILON) {
    return {
      ok: false,
      error: `Invoice arithmetic does not match order total: ${totals.computedTotal.toFixed(2)} vs order.total ${totals.orderTotal.toFixed(2)} (subtotal ${totals.subtotal.toFixed(2)}, shipping ${totals.shipping.toFixed(2)}, tax ${totals.tax.toFixed(2)}, discount ${totals.discount.toFixed(2)})`,
    };
  }
  return { ok: true };
}

module.exports = {
  getOrderShippingAmount,
  sumItemsSubtotal,
  getInvoiceSubtotalForDisplay,
  buildOrderMoneyReadModel,
  computeInvoiceTotalsForDisplay,
  validateInvoiceTotalsMatchOrder,
  TOTAL_EPSILON,
};
