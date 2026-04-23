'use strict';

/**
 * Wraps sendMail with structured success/failure logging and admin alerts for critical types.
 * Never throws: always resolves to { sent: boolean, error?, messageId? }.
 *
 * Canonical customer "receipt" emails: order_confirmation (Net 30 / POST /api/orders),
 * payment_confirmed (card/ACH after Stripe webhook). PDF invoice is downloaded separately from the app.
 */

const { sendMail } = require('./email');
const paymentLog = require('./payment-logger');

/** Failure of these types emits [EmailAlert] for visibility (order + payment + RFQ flows). */
const ADMIN_ALERT_TYPES = new Set([
  'order_confirmation',
  'admin_new_order',
  'payment_confirmed',
  'payment_failed',
  'order_shipped',
  'rfq_customer_confirmation',
  'rfq_admin_notification',
  'purchase_order_vendor',
  'contact_form_admin',
  'password_reset',
  'email_routing_reply',
]);

function recipientString(to) {
  if (to == null) return '';
  return Array.isArray(to) ? to.join(', ') : String(to);
}

function shouldAlert(emailType, alertOnFailure) {
  if (alertOnFailure === false) return false;
  if (alertOnFailure === true) return true;
  return ADMIN_ALERT_TYPES.has(emailType);
}

/**
 * Single failure path: structured logs + optional admin alert + high-visibility stderr line.
 */
function recordEmailFailure({
  emailType,
  orderId,
  orderNumber,
  recipient,
  errorMessage,
  alert,
  metadata = {},
  source,
}) {
  const err = new Error(errorMessage);
  paymentLog.emailFailed(orderId, orderNumber || '', emailType, err, {
    recipient,
    error_message: errorMessage,
    source,
    ...metadata,
  });

  console.error(
    '[EmailFailed]',
    JSON.stringify({
      ts: new Date().toISOString(),
      email_type: emailType,
      order_id: orderId,
      order_number: orderNumber,
      error_message: errorMessage,
      source,
      recipient_preview: recipient.slice(0, 120),
    })
  );

  if (alert) {
    paymentLog.adminEmailAlert({
      severity: 'error',
      email_type: emailType,
      order_id: orderId,
      order_number: orderNumber,
      error_message: errorMessage,
      recipient: recipient.slice(0, 200),
      source,
      ...metadata,
    });
  }
}

/**
 * @param {object} opts
 * @param {string|string[]} opts.to
 * @param {string} opts.subject
 * @param {string} [opts.text]
 * @param {string} [opts.html]
 * @param {string} opts.emailType
 * @param {number|string|null} [opts.orderId]
 * @param {string|null} [opts.orderNumber]
 * @param {boolean} [opts.alertOnFailure]
 * @param {Record<string, unknown>} [opts.metadata]
 * @returns {Promise<{sent: boolean, error?: string, messageId?: string}>}
 */
async function dispatchEmail(opts) {
  const emailType = opts.emailType || 'unknown';
  const orderId = opts.orderId != null ? opts.orderId : null;
  const orderNumber = opts.orderNumber != null ? opts.orderNumber : null;
  const metadata = opts.metadata && typeof opts.metadata === 'object' ? opts.metadata : {};
  const recipient = recipientString(opts.to);
  const alert = shouldAlert(emailType, opts.alertOnFailure);

  try {
    const { to, subject, text, html } = opts;
    const result = await sendMail({ to, subject, text, html });

    if (result.sent) {
      if (orderId != null) {
        paymentLog.emailSent(orderId, orderNumber || '', emailType, recipient);
      } else {
        paymentLog.log(paymentLog.EVENT_TYPES.EMAIL_SENT, {
          email_type: emailType,
          recipient,
          order_id: null,
          ...metadata,
        });
      }
      return result;
    }

    const errMsg = result.error || 'Email send failed';
    recordEmailFailure({
      emailType,
      orderId,
      orderNumber,
      recipient,
      errorMessage: errMsg,
      alert,
      metadata,
      source: 'sendMail_returned_failure',
    });
    return result;
  } catch (err) {
    const errMsg = err.message || String(err);
    recordEmailFailure({
      emailType,
      orderId,
      orderNumber,
      recipient,
      errorMessage: errMsg,
      alert,
      metadata,
      source: 'dispatch_exception',
    });
    return { sent: false, error: errMsg };
  }
}

/**
 * Fire-and-forget helper for post-commit flows (e.g. after order created). Never rejects.
 * If dispatchEmail ever rejected unexpectedly, failures are still logged + alerted.
 */
function dispatchEmailInBackground(opts) {
  return dispatchEmail(opts).catch((err) => {
    const errMsg = err.message || String(err);
    const emailType = opts.emailType || 'unknown';
    const orderId = opts.orderId != null ? opts.orderId : null;
    const orderNumber = opts.orderNumber != null ? opts.orderNumber : null;
    const recipient = recipientString(opts.to);
    const alert = shouldAlert(emailType, opts.alertOnFailure);
    recordEmailFailure({
      emailType,
      orderId,
      orderNumber,
      recipient,
      errorMessage: errMsg,
      alert,
      metadata: opts.metadata && typeof opts.metadata === 'object' ? opts.metadata : {},
      source: 'promise_rejection_after_dispatch',
    });
  });
}

module.exports = {
  dispatchEmail,
  dispatchEmailInBackground,
  ADMIN_ALERT_TYPES,
};
