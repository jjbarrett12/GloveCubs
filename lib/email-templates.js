/**
 * Email Templates for GLOVECUBS
 *
 * Provides consistent, professional HTML email templates for transactional emails.
 * All templates include plain text fallback.
 *
 * Order money (subtotal, shipping, tax, discount, grand total) uses the same read model as
 * invoices: `lib/order-invoice-totals.js` → `buildOrderMoneyReadModel`. Precedence is documented
 * there (shipping: `order.shipping` then legacy `shipping_cost`; grand total in customer-facing
 * email is only `order.total` when persisted — never synthesized from line math).
 */

const orderInvoiceTotals = require('./order-invoice-totals');

const BRAND_COLOR = '#FF7A00';
const BRAND_NAME = 'Glovecubs';
const SUPPORT_EMAIL = process.env.ADMIN_EMAIL || 'support@glovecubs.com';
const SUPPORT_PHONE = process.env.SUPPORT_PHONE || '1-800-GLOVES';
const WEBSITE_URL = process.env.DOMAIN || process.env.BASE_URL || 'https://glovecubs.com';

/**
 * Log money integrity issues for transactional email (ops / monitoring).
 * Same field rules as lib/order-invoice-totals.js (invoice / PDF).
 */
function logEmailTotalsIssue(message, meta) {
  const extra = meta && typeof meta === 'object' ? ` ${JSON.stringify(meta)}` : '';
  console.error(`[EmailTotals] ${message}${extra}`);
}

/**
 * Build read-once money model for an email send; logs missing/mismatched persisted total.
 */
function readOrderMoneyForEmail(order, items, context) {
  const list = Array.isArray(items) ? items : order?.items || [];
  const m = orderInvoiceTotals.buildOrderMoneyReadModel(order, list);
  if (m.persistedTotal == null) {
    logEmailTotalsIssue('Missing persisted order.total; grand total omitted from email', {
      context,
      order_id: order?.id,
      order_number: order?.order_number,
    });
  } else if (Math.abs(m.persistedTotal - m.computedTotal) > orderInvoiceTotals.TOTAL_EPSILON) {
    logEmailTotalsIssue('persisted order.total does not match subtotal+shipping+tax-discount', {
      context,
      order_id: order?.id,
      order_number: order?.order_number,
      persistedTotal: m.persistedTotal,
      computedTotal: m.computedTotal,
    });
  }
  return m;
}

/**
 * Base HTML wrapper for all emails
 */
function baseTemplate(content, preheader = '') {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${BRAND_NAME}</title>
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f5f5f5; }
    .wrapper { max-width: 600px; margin: 0 auto; background: #ffffff; }
    .header { background: ${BRAND_COLOR}; padding: 24px; text-align: center; }
    .header h1 { margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; }
    .content { padding: 32px 24px; }
    .footer { background: #1f2937; color: #9ca3af; padding: 24px; text-align: center; font-size: 13px; }
    .footer a { color: ${BRAND_COLOR}; text-decoration: none; }
    .btn { display: inline-block; background: ${BRAND_COLOR}; color: #ffffff !important; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; margin: 16px 0; }
    .btn:hover { background: #e56d00; }
    .order-table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    .order-table th, .order-table td { padding: 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
    .order-table th { background: #f9fafb; font-weight: 600; color: #374151; }
    .totals-table { width: 100%; max-width: 300px; margin-left: auto; }
    .totals-table td { padding: 8px 0; }
    .totals-table .total-row { font-weight: 700; font-size: 18px; border-top: 2px solid #374151; }
    .address-box { background: #f9fafb; padding: 16px; border-radius: 8px; margin: 16px 0; }
    .tracking-box { background: #ecfdf5; border: 2px solid #10b981; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center; }
    .tracking-number { font-size: 20px; font-weight: 700; color: #059669; letter-spacing: 1px; }
    .alert-box { padding: 16px; border-radius: 8px; margin: 16px 0; }
    .alert-warning { background: #fef3c7; border: 1px solid #f59e0b; }
    .alert-error { background: #fee2e2; border: 1px solid #ef4444; }
    .alert-success { background: #d1fae5; border: 1px solid #10b981; }
    .preheader { display: none; max-height: 0; overflow: hidden; }
    @media only screen and (max-width: 600px) {
      .content { padding: 24px 16px; }
      .order-table th, .order-table td { padding: 8px; font-size: 14px; }
    }
  </style>
</head>
<body>
  <div class="preheader">${preheader}</div>
  <div class="wrapper">
    <div class="header">
      <h1>${BRAND_NAME}</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p style="margin: 0 0 8px 0;">${BRAND_NAME} - Your Trusted Glove Supplier</p>
      <p style="margin: 0 0 8px 0;">
        <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> | ${SUPPORT_PHONE}
      </p>
      <p style="margin: 0;">
        <a href="${WEBSITE_URL}">${WEBSITE_URL}</a>
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Format currency
 */
function formatCurrency(amount) {
  return '$' + (Number(amount) || 0).toFixed(2);
}

/**
 * Format order items as HTML table
 */
function formatOrderItemsHtml(items) {
  if (!items || items.length === 0) return '<p><em>No items</em></p>';
  
  return `
    <table class="order-table">
      <thead>
        <tr>
          <th>Item</th>
          <th>SKU</th>
          <th style="text-align: center;">Qty</th>
          <th style="text-align: right;">Price</th>
          <th style="text-align: right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(item => {
          const name = item.product_name || item.name || 'Item';
          const sku = item.variant_sku || item.sku || '—';
          const qty = item.quantity || 1;
          const price = item.unit_price || item.price || 0;
          const total = price * qty;
          return `
            <tr>
              <td>${name}${item.size ? ` (${item.size})` : ''}</td>
              <td style="font-family: monospace; font-size: 12px;">${sku}</td>
              <td style="text-align: center;">${qty}</td>
              <td style="text-align: right;">${formatCurrency(price)}</td>
              <td style="text-align: right;">${formatCurrency(total)}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

/**
 * Format order items as plain text
 */
function formatOrderItemsText(items) {
  if (!items || items.length === 0) return '  (No items)';
  
  return items.map(item => {
    const name = item.product_name || item.name || 'Item';
    const sku = item.variant_sku || item.sku || '';
    const qty = item.quantity || 1;
    const price = item.unit_price || item.price || 0;
    const total = price * qty;
    return `  • ${name}${item.size ? ` (${item.size})` : ''} x${qty} - ${formatCurrency(total)}${sku ? ` [${sku}]` : ''}`;
  }).join('\n');
}

/**
 * HTML totals table from pre-built read model (invoice-aligned fields).
 * Does not fabricate grand total when persistedTotal is null.
 */
function formatTotalsHtmlFromModel(m) {
  const discountRow =
    m.discount > 0
      ? `
      <tr style="color: #059669;">
        <td>Discount:</td>
        <td style="text-align: right;">-${formatCurrency(m.discount)}</td>
      </tr>
      `
      : '';
  const grandTotalRow =
    m.persistedTotal != null
      ? `<tr class="total-row">
        <td>Total:</td>
        <td style="text-align: right;">${formatCurrency(m.persistedTotal)}</td>
      </tr>`
      : `<tr>
        <td colspan="2" style="font-size: 13px; color: #92400e; padding-top: 12px; border-top: 2px solid #e5e7eb; line-height: 1.5;">
          <strong>Grand total</strong> is not shown in this email because the order record has no stored total. Use your <strong>invoice</strong> or <strong>order history</strong> for the amount charged — those match our records.
        </td>
      </tr>`;

  return `
    <table class="totals-table">
      <tr>
        <td>Subtotal:</td>
        <td style="text-align: right;">${formatCurrency(m.subtotal)}</td>
      </tr>
      ${discountRow}
      <tr>
        <td>Shipping:</td>
        <td style="text-align: right;">${m.shipping === 0 ? 'FREE' : formatCurrency(m.shipping)}</td>
      </tr>
      <tr>
        <td>Tax:</td>
        <td style="text-align: right;">${formatCurrency(m.tax)}</td>
      </tr>
      ${grandTotalRow}
    </table>
  `;
}

/**
 * Plain-text totals block (same numbers as HTML / invoice read model).
 */
function formatOrderTotalsPlainTextFromModel(m) {
  let s = `Subtotal: ${formatCurrency(m.subtotal)}\n`;
  if (m.discount > 0) s += `Discount: -${formatCurrency(m.discount)}\n`;
  s += `Shipping: ${m.shipping === 0 ? 'FREE' : formatCurrency(m.shipping)}\n`;
  s += `Tax: ${formatCurrency(m.tax)}\n`;
  s +=
    m.persistedTotal != null
      ? `Total: ${formatCurrency(m.persistedTotal)}\n`
      : `Total: (not shown in this email — open your invoice or order history for the charged amount)\n`;
  return s;
}

/** @deprecated Prefer readOrderMoneyForEmail + formatTotalsHtmlFromModel for one log per send */
function formatTotalsHtml(order, items) {
  const money = readOrderMoneyForEmail(order, items != null ? items : order?.items, 'formatTotalsHtml');
  return formatTotalsHtmlFromModel(money);
}

/**
 * Format shipping address
 */
function formatShippingAddress(address) {
  if (!address) return 'Not specified';
  if (typeof address === 'string') return address;
  if (address.display) return address.display;
  
  const parts = [];
  if (address.full_name) parts.push(address.full_name);
  if (address.company_name) parts.push(address.company_name);
  if (address.address_line1) parts.push(address.address_line1);
  if (address.address_line2) parts.push(address.address_line2);
  const cityLine = [address.city, address.state, address.zip_code].filter(Boolean).join(', ').replace(/, (\d)/, ' $1');
  if (cityLine) parts.push(cityLine);
  if (address.phone) parts.push(`Phone: ${address.phone}`);
  
  return parts.join('\n');
}

// ============================================================================
// EMAIL TEMPLATES
// ============================================================================

/**
 * Order Confirmation Email
 */
function orderConfirmation(order, user, options) {
  const opts = options || {};
  const orderNumber = order.order_number || 'N/A';
  const items = order.items || [];
  const money = readOrderMoneyForEmail(order, items, 'orderConfirmation');
  const shippingAddr = formatShippingAddress(order.shipping_address);
  let paymentMethod = order.payment_method === 'ach' ? 'ACH Bank Transfer' : 'Credit Card';
  if (order.payment_method === 'net30') {
    paymentMethod = opts.invoiceTermsLabel
      ? `${opts.invoiceTermsLabel} (pay on invoice)`
      : 'Net 30 (pay on invoice)';
  }
  
  const html = baseTemplate(`
    <h2 style="color: #059669; margin-top: 0;">✓ Order Confirmed!</h2>
    <p>Hi ${user?.contact_name || 'there'},</p>
    <p>Thank you for your order. We've received it and will begin processing it shortly.</p>
    
    <div style="background: #f0fdf4; border: 2px solid #10b981; padding: 16px; border-radius: 8px; margin: 20px 0; text-align: center;">
      <p style="margin: 0; color: #374151;">Order Number</p>
      <p style="margin: 8px 0 0 0; font-size: 24px; font-weight: 700; color: #059669;">${orderNumber}</p>
    </div>
    
    <h3 style="margin-bottom: 8px;">Order Details</h3>
    ${formatOrderItemsHtml(items)}
    ${formatTotalsHtmlFromModel(money)}
    
    <div class="address-box">
      <h4 style="margin: 0 0 8px 0;">Shipping Address</h4>
      <p style="margin: 0; white-space: pre-line;">${shippingAddr.replace(/\n/g, '<br>')}</p>
    </div>
    
    <p><strong>Payment Method:</strong> ${paymentMethod}</p>
    
    <p style="margin-top: 24px;">We'll send you another email with tracking information once your order ships.</p>
    
    <p style="text-align: center; margin-top: 32px;">
      <a href="${WEBSITE_URL}#portal-orders" class="btn">View Order Status</a>
    </p>
    
    <p style="color: #6b7280; font-size: 14px; margin-top: 32px;">
      Questions about your order? Reply to this email or contact us at 
      <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.
    </p>
  `, `Order ${orderNumber} confirmed - Thank you for your order!`);
  
  const text = `
Order Confirmed!

Hi ${user?.contact_name || 'there'},

Thank you for your order. We've received it and will begin processing it shortly.

Order Number: ${orderNumber}

ORDER DETAILS
${formatOrderItemsText(items)}

${formatOrderTotalsPlainTextFromModel(money)}
SHIPPING ADDRESS
${shippingAddr}

Payment Method: ${paymentMethod}

We'll send you another email with tracking information once your order ships.

Questions? Contact us at ${SUPPORT_EMAIL}

${BRAND_NAME}
${WEBSITE_URL}
  `.trim();
  
  return {
    subject: `Order Confirmed: ${orderNumber}`,
    html,
    text
  };
}

/**
 * Payment Success Email (for card/ACH payments after Stripe confirmation)
 */
function paymentSuccess(order, user) {
  const orderNumber = order.order_number || 'N/A';
  const items = order.items || [];
  const money = readOrderMoneyForEmail(order, items, 'paymentSuccess');
  const shippingAddr = formatShippingAddress(order.shipping_address);
  
  const html = baseTemplate(`
    <h2 style="color: #059669; margin-top: 0;">✓ Payment Confirmed!</h2>
    <p>Hi ${user?.contact_name || 'there'},</p>
    <p>Great news! Your payment has been successfully processed.</p>
    
    <div style="background: #f0fdf4; border: 2px solid #10b981; padding: 16px; border-radius: 8px; margin: 20px 0; text-align: center;">
      <p style="margin: 0; color: #374151;">Order Number</p>
      <p style="margin: 8px 0 0 0; font-size: 24px; font-weight: 700; color: #059669;">${orderNumber}</p>
    </div>
    
    <h3 style="margin-bottom: 8px;">Order Summary</h3>
    ${formatOrderItemsHtml(items)}
    ${formatTotalsHtmlFromModel(money)}
    
    <div class="address-box">
      <h4 style="margin: 0 0 8px 0;">Shipping To</h4>
      <p style="margin: 0; white-space: pre-line;">${shippingAddr.replace(/\n/g, '<br>')}</p>
    </div>
    
    <p>Your order is now being prepared for shipment. We'll notify you when it ships with tracking information.</p>
    
    <p style="text-align: center; margin-top: 32px;">
      <a href="${WEBSITE_URL}#portal-orders" class="btn">Track Your Order</a>
    </p>
    
    <p style="color: #6b7280; font-size: 14px; margin-top: 32px;">
      Need help? Contact us at <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>
    </p>
  `, `Payment confirmed for order ${orderNumber}`);
  
  const text = `
Payment Confirmed!

Hi ${user?.contact_name || 'there'},

Great news! Your payment has been successfully processed.

Order Number: ${orderNumber}

ORDER SUMMARY
${formatOrderItemsText(items)}

${formatOrderTotalsPlainTextFromModel(money)}
SHIPPING TO
${shippingAddr}

Your order is now being prepared for shipment. We'll notify you when it ships with tracking information.

Need help? Contact us at ${SUPPORT_EMAIL}

${BRAND_NAME}
${WEBSITE_URL}
  `.trim();
  
  return {
    subject: `Payment Confirmed: ${orderNumber}`,
    html,
    text
  };
}

/**
 * Payment Failed Email
 */
function paymentFailed(order, user, errorMessage = null) {
  const orderNumber = order.order_number || 'N/A';
  const items = order.items || [];
  const money = readOrderMoneyForEmail(order, items, 'paymentFailed');
  const amountHtml =
    money.persistedTotal != null
      ? `<p style="margin: 8px 0 0 0;"><strong>Order total (on record):</strong> ${formatCurrency(money.persistedTotal)}</p>`
      : `<p style="margin: 8px 0 0 0;"><strong>Order total:</strong> Not shown — your order record has no stored total. Use your <strong>invoice</strong> or <strong>order history</strong> for the amount due (same source as our records).</p>`;
  const amountText =
    money.persistedTotal != null
      ? `Order total (on record): ${formatCurrency(money.persistedTotal)}`
      : `Order total: not shown (no stored total on order — see invoice or order history for amount due)`;

  const html = baseTemplate(`
    <h2 style="color: #dc2626; margin-top: 0;">⚠ Payment Issue</h2>
    <p>Hi ${user?.contact_name || 'there'},</p>
    <p>We were unable to process the payment for your order.</p>
    
    <div class="alert-box alert-error">
      <p style="margin: 0;"><strong>Order:</strong> ${orderNumber}</p>
      ${amountHtml}
      ${errorMessage ? `<p style="margin: 8px 0 0 0;"><strong>Reason:</strong> ${errorMessage}</p>` : ''}
    </div>
    
    <h3>What to do next:</h3>
    <ol style="color: #374151; line-height: 1.8;">
      <li>Check that your card details are correct</li>
      <li>Ensure sufficient funds are available</li>
      <li>Try a different payment method</li>
      <li>Contact your bank if the issue persists</li>
    </ol>
    
    <p style="text-align: center; margin-top: 32px;">
      <a href="${WEBSITE_URL}#checkout" class="btn">Retry Payment</a>
    </p>
    
    <p style="margin-top: 24px;">
      If you continue to experience issues, please contact us at 
      <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> and we'll help resolve this.
    </p>
    
    <p style="color: #6b7280; font-size: 13px; margin-top: 32px;">
      Your cart items have been saved and any reserved inventory has been released.
    </p>
  `, `Action required: Payment failed for order ${orderNumber}`);
  
  const text = `
Payment Issue

Hi ${user?.contact_name || 'there'},

We were unable to process the payment for your order.

Order: ${orderNumber}
${amountText}
${errorMessage ? `Reason: ${errorMessage}` : ''}

WHAT TO DO NEXT:
1. Check that your card details are correct
2. Ensure sufficient funds are available
3. Try a different payment method
4. Contact your bank if the issue persists

Visit ${WEBSITE_URL}#checkout to retry payment.

If you continue to experience issues, contact us at ${SUPPORT_EMAIL}.

${BRAND_NAME}
${WEBSITE_URL}
  `.trim();
  
  return {
    subject: `Payment Failed: ${orderNumber} - Action Required`,
    html,
    text
  };
}

/**
 * Order Shipped Email
 */
function orderShipped(order, user, trackingInfo = {}) {
  const orderNumber = order.order_number || 'N/A';
  const trackingNumber = trackingInfo.tracking_number || order.tracking_number || null;
  const trackingUrl = trackingInfo.tracking_url || order.tracking_url || null;
  const carrier = trackingInfo.carrier || 'your carrier';
  const items = order.items || [];
  const shippingAddr = formatShippingAddress(order.shipping_address);
  
  const trackingSection = trackingNumber ? `
    <div class="tracking-box">
      <p style="margin: 0 0 8px 0; color: #374151;">Your tracking number:</p>
      <p class="tracking-number" style="margin: 0;">${trackingNumber}</p>
      ${trackingUrl ? `
        <p style="margin: 16px 0 0 0;">
          <a href="${trackingUrl}" class="btn" style="background: #059669;">Track Package</a>
        </p>
      ` : ''}
    </div>
  ` : `
    <div class="alert-box alert-success">
      <p style="margin: 0;">Your order has shipped! Tracking information will be available soon.</p>
    </div>
  `;
  
  const html = baseTemplate(`
    <h2 style="color: #059669; margin-top: 0;">📦 Your Order Has Shipped!</h2>
    <p>Hi ${user?.contact_name || 'there'},</p>
    <p>Great news! Your order <strong>${orderNumber}</strong> is on its way.</p>
    
    ${trackingSection}
    
    <div class="address-box">
      <h4 style="margin: 0 0 8px 0;">Shipping To</h4>
      <p style="margin: 0; white-space: pre-line;">${shippingAddr.replace(/\n/g, '<br>')}</p>
    </div>
    
    <h3 style="margin-bottom: 8px;">Items Shipped</h3>
    ${formatOrderItemsHtml(items)}
    
    <p style="margin-top: 24px; color: #6b7280;">
      <strong>Estimated delivery:</strong> 3-5 business days (varies by location)
    </p>
    
    <p style="text-align: center; margin-top: 32px;">
      <a href="${WEBSITE_URL}#portal-orders" class="btn">View Order Details</a>
    </p>
    
    <p style="color: #6b7280; font-size: 14px; margin-top: 32px;">
      Questions about your shipment? Contact us at 
      <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>
    </p>
  `, `Your order ${orderNumber} has shipped!`);
  
  const text = `
Your Order Has Shipped!

Hi ${user?.contact_name || 'there'},

Great news! Your order ${orderNumber} is on its way.

${trackingNumber ? `TRACKING NUMBER: ${trackingNumber}` : 'Tracking information will be available soon.'}
${trackingUrl ? `Track your package: ${trackingUrl}` : ''}

SHIPPING TO
${shippingAddr}

ITEMS SHIPPED
${formatOrderItemsText(items)}

Estimated delivery: 3-5 business days (varies by location)

Questions? Contact us at ${SUPPORT_EMAIL}

${BRAND_NAME}
${WEBSITE_URL}
  `.trim();
  
  return {
    subject: `Your Order Has Shipped: ${orderNumber}`,
    html,
    text
  };
}

/**
 * RFQ Confirmation Email
 */
function rfqConfirmation(rfq, user) {
  const html = baseTemplate(`
    <h2 style="color: ${BRAND_COLOR}; margin-top: 0;">Request for Quote Received</h2>
    <p>Hi ${rfq.contact_name || user?.contact_name || 'there'},</p>
    <p>Thank you for your request for quote. Our team will review your requirements and get back to you within 1-2 business days.</p>
    
    <div class="address-box">
      <h4 style="margin: 0 0 12px 0;">Your Request</h4>
      <table style="width: 100%;">
        <tr>
          <td style="padding: 4px 0; color: #6b7280;">Company:</td>
          <td style="padding: 4px 0;">${rfq.company_name || '—'}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #6b7280;">Product Type:</td>
          <td style="padding: 4px 0;">${rfq.type || '—'}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #6b7280;">Quantity:</td>
          <td style="padding: 4px 0;">${rfq.quantity || '—'}</td>
        </tr>
        ${rfq.product_interest ? `
        <tr>
          <td style="padding: 4px 0; color: #6b7280;">Product / SKU:</td>
          <td style="padding: 4px 0;">${rfq.product_interest}</td>
        </tr>` : ''}
        ${rfq.estimated_volume ? `
        <tr>
          <td style="padding: 4px 0; color: #6b7280;">Est. volume:</td>
          <td style="padding: 4px 0;">${rfq.estimated_volume}</td>
        </tr>` : ''}
        <tr>
          <td style="padding: 4px 0; color: #6b7280;">Use Case:</td>
          <td style="padding: 4px 0;">${rfq.use_case || '—'}</td>
        </tr>
        ${rfq.notes ? `
        <tr>
          <td style="padding: 4px 0; color: #6b7280; vertical-align: top;">Notes:</td>
          <td style="padding: 4px 0;">${rfq.notes}</td>
        </tr>
        ` : ''}
      </table>
    </div>
    
    <p>While you wait, feel free to browse our catalog or contact us with any questions.</p>
    
    <p style="text-align: center; margin-top: 32px;">
      <a href="${WEBSITE_URL}#products" class="btn">Browse Products</a>
    </p>
    
    <p style="color: #6b7280; font-size: 14px; margin-top: 32px;">
      Need immediate assistance? Call us at ${SUPPORT_PHONE} or email 
      <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>
    </p>
  `, 'We received your request for quote');
  
  const text = `
Request for Quote Received

Hi ${rfq.contact_name || user?.contact_name || 'there'},

Thank you for your request for quote. Our team will review your requirements and get back to you within 1-2 business days.

YOUR REQUEST
Company: ${rfq.company_name || '—'}
Product Type: ${rfq.type || '—'}
Quantity: ${rfq.quantity || '—'}
Use Case: ${rfq.use_case || '—'}
${rfq.notes ? `Notes: ${rfq.notes}` : ''}

While you wait, feel free to browse our catalog at ${WEBSITE_URL}

Need immediate assistance? Call us at ${SUPPORT_PHONE} or email ${SUPPORT_EMAIL}

${BRAND_NAME}
${WEBSITE_URL}
  `.trim();
  
  return {
    subject: 'We Received Your Quote Request - Glovecubs',
    html,
    text
  };
}

/**
 * Admin notification for new order
 */
function adminNewOrder(order, user) {
  const orderNumber = order.order_number || 'N/A';
  const items = order.items || [];
  const money = readOrderMoneyForEmail(order, items, 'adminNewOrder');
  const shippingAddr = formatShippingAddress(order.shipping_address);
  const summaryTotalHtml =
    money.persistedTotal != null
      ? `<p style="margin: 8px 0 0 0;"><strong>Total (persisted):</strong> ${formatCurrency(money.persistedTotal)}</p>`
      : `<p style="margin: 8px 0 0 0;"><strong>Total (persisted):</strong> <em>Missing — itemized breakdown below uses invoice field rules (no fabricated grand total).</em></p>`;

  const html = baseTemplate(`
    <h2 style="margin-top: 0;">🛒 New Order Received</h2>
    
    <div style="background: #fef3c7; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
      <p style="margin: 0;"><strong>Order:</strong> ${orderNumber}</p>
      ${summaryTotalHtml}
      <p style="margin: 8px 0 0 0;"><strong>Payment:</strong> ${order.payment_method || 'N/A'}</p>
    </div>
    
    <h3>Customer</h3>
    <p>
      <strong>${user?.company_name || 'Guest'}</strong><br>
      ${user?.contact_name || '—'}<br>
      ${user?.email || '—'}<br>
      ${user?.phone || '—'}
    </p>
    
    <h3>Items</h3>
    ${formatOrderItemsHtml(items)}
    ${formatTotalsHtmlFromModel(money)}
    
    <h3>Ship To</h3>
    <p style="white-space: pre-line;">${shippingAddr.replace(/\n/g, '<br>')}</p>
    
    <p style="text-align: center; margin-top: 32px;">
      <a href="${WEBSITE_URL}#admin-orders" class="btn">View in Admin</a>
    </p>
  `);
  
  const text = `
NEW ORDER RECEIVED

Order: ${orderNumber}
${money.persistedTotal != null ? `Total (persisted): ${formatCurrency(money.persistedTotal)}` : 'Total (persisted): missing on order record — see itemized totals below'}
Payment: ${order.payment_method || 'N/A'}

CUSTOMER
${user?.company_name || 'Guest'}
${user?.contact_name || '—'}
${user?.email || '—'}
${user?.phone || '—'}

ITEMS
${formatOrderItemsText(items)}

${formatOrderTotalsPlainTextFromModel(money)}
SHIP TO
${shippingAddr}

View in admin: ${WEBSITE_URL}#admin-orders
  `.trim();
  
  return {
    subject:
      money.persistedTotal != null
        ? `[Glovecubs] New Order: ${orderNumber} - ${formatCurrency(money.persistedTotal)}`
        : `[Glovecubs] New Order: ${orderNumber}`,
    html,
    text
  };
}

/**
 * Test email template
 */
function testEmail(recipientEmail) {
  const html = baseTemplate(`
    <h2 style="margin-top: 0;">✓ Email Configuration Test</h2>
    <p>This is a test email from ${BRAND_NAME}.</p>
    
    <div class="alert-box alert-success">
      <p style="margin: 0;"><strong>Success!</strong> Your email configuration is working correctly.</p>
    </div>
    
    <p><strong>Configuration:</strong></p>
    <ul>
      <li>SMTP Host: ${process.env.SMTP_HOST || 'Not set'}</li>
      <li>SMTP Port: ${process.env.SMTP_PORT || '587'}</li>
      <li>From Address: ${process.env.SMTP_FROM || process.env.SMTP_USER || 'Not set'}</li>
      <li>Sent To: ${recipientEmail}</li>
      <li>Timestamp: ${new Date().toISOString()}</li>
    </ul>
    
    <p>If you received this email, your transactional email system is ready.</p>
  `, 'Test email from Glovecubs');
  
  const text = `
Email Configuration Test

This is a test email from ${BRAND_NAME}.

SUCCESS! Your email configuration is working correctly.

Configuration:
- SMTP Host: ${process.env.SMTP_HOST || 'Not set'}
- SMTP Port: ${process.env.SMTP_PORT || '587'}
- From Address: ${process.env.SMTP_FROM || process.env.SMTP_USER || 'Not set'}
- Sent To: ${recipientEmail}
- Timestamp: ${new Date().toISOString()}

If you received this email, your transactional email system is ready.

${BRAND_NAME}
  `.trim();
  
  return {
    subject: '[Glovecubs] Email Configuration Test',
    html,
    text
  };
}

module.exports = {
  orderConfirmation,
  paymentSuccess,
  paymentFailed,
  orderShipped,
  rfqConfirmation,
  adminNewOrder,
  testEmail,
  formatCurrency,
  formatShippingAddress,
  formatOrderItemsHtml,
  formatOrderItemsText
};
