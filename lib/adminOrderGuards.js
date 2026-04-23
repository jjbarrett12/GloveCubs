/**
 * Guardrails for admin-driven order status changes (payment + inventory lifecycle).
 * Does not replace webhooks or checkout; blocks impossible or dangerous transitions.
 */

const ABANDON_STATUSES = new Set(['cancelled', 'payment_failed', 'expired']);

/** Status values admins may set via PUT /api/admin/orders/:id (not customer/checkout). */
const ADMIN_SETTABLE_STATUSES = new Set([
  'pending',
  'processing',
  'invoiced',
  'shipped',
  'completed',
  'delivered',
  'cancelled',
  'payment_failed',
  'expired',
]);

const SHIPPABLE_FROM = new Set(['pending', 'processing', 'invoiced']);

const POST_SHIP_FORWARD = new Set(['shipped', 'delivered', 'completed']);

function truthyHold(v) {
  return v === true || v === 1 || v === '1' || v === 'true';
}

function orderRequiresOnlinePaymentConfirmation(order) {
  const pm = String(order.payment_method || '').toLowerCase();
  if (pm === 'credit_card' || pm === 'ach') return true;
  const pi = order.stripe_payment_intent_id;
  if (pi != null && String(pi).trim() !== '') return true;
  return false;
}

/**
 * @param {Record<string, unknown>} order - row from getOrderByIdAdmin
 * @param {string|undefined} nextStatus - requested status (undefined = no status change)
 * @returns {{ ok: true } | { ok: false, code: string, message: string, httpStatus: number }}
 */
function validateAdminOrderStatusTransition(order, nextStatus) {
  if (nextStatus === undefined || nextStatus === null) {
    return { ok: true };
  }

  const next = String(nextStatus).trim().toLowerCase();
  const cur = String(order.status || '').trim().toLowerCase();

  if (next === cur) {
    return { ok: true };
  }

  if (!ADMIN_SETTABLE_STATUSES.has(next)) {
    return {
      ok: false,
      code: 'INVALID_ADMIN_STATUS',
      message: `Admin cannot set order status to "${next}".`,
      httpStatus: 400,
    };
  }

  if (next === 'pending_payment') {
    return {
      ok: false,
      code: 'CANNOT_SET_PENDING_PAYMENT',
      message: 'Do not manually set awaiting-payment state; use checkout or Stripe.',
      httpStatus: 400,
    };
  }

  if (cur === 'shipped' && !POST_SHIP_FORWARD.has(next)) {
    return {
      ok: false,
      code: 'CANNOT_REGRESS_SHIPPED',
      message: 'Shipped orders cannot move backward without a documented RMA/restock workflow.',
      httpStatus: 409,
    };
  }

  if (ABANDON_STATUSES.has(next) && order.inventory_deducted_at) {
    return {
      ok: false,
      code: 'POST_DEDUCT_ABANDON_BLOCKED',
      message:
        'Stock was already deducted for this order. Use an explicit restock/refund workflow before cancelling or failing payment.',
      httpStatus: 409,
    };
  }

  if (next === 'shipped') {
    if (truthyHold(order.payment_integrity_hold)) {
      return {
        ok: false,
        code: 'PAYMENT_INTEGRITY_HOLD',
        message: 'Order is on payment integrity hold; resolve Stripe vs order total before shipping.',
        httpStatus: 409,
      };
    }
    if (cur === 'pending_payment') {
      return {
        ok: false,
        code: 'SHIP_REQUIRES_PAYMENT',
        message: 'Cannot ship an order that is still awaiting payment.',
        httpStatus: 409,
      };
    }
    if (orderRequiresOnlinePaymentConfirmation(order) && !order.payment_confirmed_at) {
      return {
        ok: false,
        code: 'SHIP_REQUIRES_PAYMENT_CONFIRMATION',
        message: 'Card/ACH (or Stripe) orders must have payment confirmed before shipping.',
        httpStatus: 409,
      };
    }
    if (!SHIPPABLE_FROM.has(cur)) {
      return {
        ok: false,
        code: 'SHIP_INVALID_FROM_STATE',
        message: `Cannot mark shipped from status "${cur}".`,
        httpStatus: 409,
      };
    }
  }

  if (cur === 'pending_payment' && !ABANDON_STATUSES.has(next)) {
    return {
      ok: false,
      code: 'PENDING_PAYMENT_FULFILLMENT_BLOCKED',
      message:
        'Orders awaiting payment can only move to cancelled, expired, or payment_failed—not into fulfillment.',
      httpStatus: 409,
    };
  }

  return { ok: true };
}

module.exports = {
  validateAdminOrderStatusTransition,
  ABANDON_STATUSES,
  ADMIN_SETTABLE_STATUSES,
  orderRequiresOnlinePaymentConfirmation,
};
