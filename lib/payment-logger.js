/**
 * Structured Payment Logger for GLOVECUBS
 * 
 * Provides consistent, structured logging for all payment-related events.
 * Logs are formatted for easy parsing and monitoring.
 */

const LOG_PREFIX = '[Payment]';

const EVENT_TYPES = {
  PAYMENT_INTENT_CREATED: 'payment_intent.created',
  PAYMENT_INTENT_SUCCEEDED: 'payment_intent.succeeded',
  PAYMENT_INTENT_FAILED: 'payment_intent.failed',
  PAYMENT_INTENT_CANCELED: 'payment_intent.canceled',
  INVENTORY_RESERVED: 'inventory.reserved',
  INVENTORY_RELEASED: 'inventory.released',
  INVENTORY_DEDUCTED: 'inventory.deducted',
  ORDER_CREATED: 'order.created',
  ORDER_STATUS_UPDATED: 'order.status_updated',
  WEBHOOK_RECEIVED: 'webhook.received',
  WEBHOOK_VERIFIED: 'webhook.verified',
  WEBHOOK_REJECTED: 'webhook.rejected',
  WEBHOOK_PROCESSED: 'webhook.processed',
  WEBHOOK_SKIPPED: 'webhook.skipped',
  WEBHOOK_ERROR: 'webhook.error',
  DUPLICATE_PREVENTED: 'duplicate.prevented',
  EMAIL_SENT: 'email.sent',
  EMAIL_FAILED: 'email.failed',
};

function formatLog(eventType, data) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    event: eventType,
    ...data,
  };
  return `${LOG_PREFIX} ${JSON.stringify(logEntry)}`;
}

function log(eventType, data = {}) {
  const message = formatLog(eventType, data);
  console.log(message);
  return message;
}

function logError(eventType, error, data = {}) {
  const message = formatLog(eventType, {
    ...data,
    error: error.message || String(error),
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
  });
  console.error(message);
  return message;
}

function paymentIntentCreated(paymentIntentId, orderNumber, userId, amountCents) {
  return log(EVENT_TYPES.PAYMENT_INTENT_CREATED, {
    payment_intent_id: paymentIntentId,
    order_number: orderNumber,
    user_id: userId,
    amount_cents: amountCents,
  });
}

function paymentIntentSucceeded(paymentIntentId, orderId, orderNumber) {
  return log(EVENT_TYPES.PAYMENT_INTENT_SUCCEEDED, {
    payment_intent_id: paymentIntentId,
    order_id: orderId,
    order_number: orderNumber,
  });
}

function paymentIntentFailed(paymentIntentId, orderId, reason) {
  return log(EVENT_TYPES.PAYMENT_INTENT_FAILED, {
    payment_intent_id: paymentIntentId,
    order_id: orderId,
    reason,
  });
}

function paymentIntentCanceled(paymentIntentId, orderId) {
  return log(EVENT_TYPES.PAYMENT_INTENT_CANCELED, {
    payment_intent_id: paymentIntentId,
    order_id: orderId,
  });
}

function inventoryReserved(orderId, items) {
  return log(EVENT_TYPES.INVENTORY_RESERVED, {
    order_id: orderId,
    item_count: items.length,
    items: items.map(i => ({ product_id: i.product_id, quantity: i.quantity })),
  });
}

function inventoryReleased(orderId, reason) {
  return log(EVENT_TYPES.INVENTORY_RELEASED, {
    order_id: orderId,
    reason,
  });
}

function inventoryDeducted(orderId) {
  return log(EVENT_TYPES.INVENTORY_DEDUCTED, {
    order_id: orderId,
  });
}

function orderCreated(orderId, orderNumber, userId, total, paymentMethod) {
  return log(EVENT_TYPES.ORDER_CREATED, {
    order_id: orderId,
    order_number: orderNumber,
    user_id: userId,
    total,
    payment_method: paymentMethod,
  });
}

function orderStatusUpdated(orderId, orderNumber, oldStatus, newStatus) {
  return log(EVENT_TYPES.ORDER_STATUS_UPDATED, {
    order_id: orderId,
    order_number: orderNumber,
    old_status: oldStatus,
    new_status: newStatus,
  });
}

function webhookReceived(eventId, eventType) {
  return log(EVENT_TYPES.WEBHOOK_RECEIVED, {
    event_id: eventId,
    event_type: eventType,
  });
}

function webhookVerified(eventId, eventType) {
  return log(EVENT_TYPES.WEBHOOK_VERIFIED, {
    event_id: eventId,
    event_type: eventType,
  });
}

function webhookRejected(reason, signature) {
  return log(EVENT_TYPES.WEBHOOK_REJECTED, {
    reason,
    signature_present: !!signature,
  });
}

function webhookProcessed(eventId, eventType, orderId, duration) {
  return log(EVENT_TYPES.WEBHOOK_PROCESSED, {
    event_id: eventId,
    event_type: eventType,
    order_id: orderId,
    duration_ms: duration,
  });
}

function webhookSkipped(eventId, eventType, reason, orderId) {
  return log(EVENT_TYPES.WEBHOOK_SKIPPED, {
    event_id: eventId,
    event_type: eventType,
    reason,
    order_id: orderId,
  });
}

function webhookError(eventId, eventType, error) {
  return logError(EVENT_TYPES.WEBHOOK_ERROR, error, {
    event_id: eventId,
    event_type: eventType,
  });
}

function duplicatePrevented(userId, existingOrderNumber, existingOrderId) {
  return log(EVENT_TYPES.DUPLICATE_PREVENTED, {
    user_id: userId,
    existing_order_number: existingOrderNumber,
    existing_order_id: existingOrderId,
  });
}

function emailSent(orderId, orderNumber, type, recipient) {
  return log(EVENT_TYPES.EMAIL_SENT, {
    order_id: orderId,
    order_number: orderNumber,
    email_type: type,
    recipient,
  });
}

function emailFailed(orderId, orderNumber, type, error, extra = {}) {
  const err = error instanceof Error ? error : new Error(String(error));
  const msg = err.message || String(error);
  return logError(EVENT_TYPES.EMAIL_FAILED, err, {
    ...extra,
    order_id: orderId,
    order_number: orderNumber,
    email_type: type,
    error_message: extra.error_message != null ? extra.error_message : msg,
  });
}

/** High-visibility line for ops; pair with log aggregation or grep on [EmailAlert]. */
function adminEmailAlert(data) {
  const line = {
    ts: new Date().toISOString(),
    channel: 'admin_email_alert',
    ...data,
  };
  console.error('[EmailAlert]', JSON.stringify(line));
  return line;
}

module.exports = {
  EVENT_TYPES,
  log,
  logError,
  paymentIntentCreated,
  paymentIntentSucceeded,
  paymentIntentFailed,
  paymentIntentCanceled,
  inventoryReserved,
  inventoryReleased,
  inventoryDeducted,
  orderCreated,
  orderStatusUpdated,
  webhookReceived,
  webhookVerified,
  webhookRejected,
  webhookProcessed,
  webhookSkipped,
  webhookError,
  duplicatePrevented,
  emailSent,
  emailFailed,
  adminEmailAlert,
};
