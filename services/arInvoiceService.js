'use strict';

const { getSupabaseAdmin } = require('../lib/supabaseAdmin');
const { computeInvoiceDueAtIso } = require('../lib/invoice-due');

function isUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || ''));
}

function throwIfArApplyFailed(data, rpcLabel) {
  if (!data || data.ok === true) return;
  const rawErr = data && data.error;
  const msg =
    rawErr === 'CREDIT_LIMIT_EXCEEDED'
      ? 'This order would exceed your approved credit limit. Pay by card or ACH, or contact your account representative.'
      : rawErr === 'company_required'
        ? 'Invoice checkout requires a company on the order. Contact support.'
        : rawErr || `${rpcLabel} failed`;
  const err = new Error(msg);
  err.statusCode = rawErr === 'CREDIT_LIMIT_EXCEEDED' ? 400 : 500;
  if (rawErr === 'CREDIT_LIMIT_EXCEEDED') {
    err.code = 'CREDIT_LIMIT_EXCEEDED';
    err.credit_limit = data.credit_limit != null ? Number(data.credit_limit) : undefined;
    err.outstanding_balance =
      data.outstanding_balance != null ? Number(data.outstanding_balance) : undefined;
    err.order_total = data.order_total != null ? Number(data.order_total) : undefined;
    err.projected_outstanding =
      data.projected_outstanding != null ? Number(data.projected_outstanding) : undefined;
    err.available_credit =
      data.available_credit != null ? Number(data.available_credit) : undefined;
  }
  err.arPayload = data;
  throw err;
}

/**
 * After a net30 order is reserved, open AR on gc_commerce (invoice fields + company.outstanding_balance).
 * @param {object} opts
 * @param {string} opts.orderId - gc order UUID
 * @param {string|null} opts.companyId - gc company UUID
 * @param {number} opts.orderTotal - dollars (matches invoice RPC numeric)
 * @param {object|null} opts.companyRow - terms code + due date
 * @param {string|undefined} opts.orderCreatedAt
 */
async function applyNet30OrderOpen(opts) {
  const orderId = opts.orderId;
  const orderTotal = Number(opts.orderTotal);
  if (!isUuid(orderId)) {
    const err = new Error('Invalid order id');
    err.statusCode = 400;
    throw err;
  }
  if (!Number.isFinite(orderTotal) || orderTotal < 0) {
    const err = new Error('Invalid order total for AR');
    err.statusCode = 400;
    throw err;
  }

  const companyRow = opts.companyRow || null;
  let termsCode = 'net30';
  if (companyRow && companyRow.invoice_terms_code) {
    termsCode = String(companyRow.invoice_terms_code).toLowerCase().trim() || 'net30';
  }
  const dueAt = computeInvoiceDueAtIso(opts.orderCreatedAt, companyRow);

  const companyId =
    opts.companyId != null && String(opts.companyId).trim() !== '' ? String(opts.companyId).trim() : null;
  const pCompany = isUuid(companyId) ? companyId : null;

  const sb = getSupabaseAdmin();
  const { data, error } = await sb.rpc('glovecubs_apply_net30_order_ar_gc', {
    p_order_id: String(orderId),
    p_company_id: pCompany,
    p_amount: orderTotal,
    p_terms_code: termsCode,
    p_due_at: dueAt,
  });
  if (error) throw error;
  throwIfArApplyFailed(data, 'glovecubs_apply_net30_order_ar_gc');
  return data;
}

/**
 * Record a payment against a net30 invoice order (gc_commerce only).
 */
async function recordInvoicePayment(opts) {
  const orderId = opts.orderId;
  const amount = Number(opts.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    const err = new Error('amount must be a positive number');
    err.statusCode = 400;
    throw err;
  }

  const companyId =
    opts.companyId != null && String(opts.companyId).trim() !== '' ? String(opts.companyId).trim() : null;
  if (!isUuid(orderId)) {
    const err = new Error('Invalid order id');
    err.statusCode = 400;
    throw err;
  }
  if (!isUuid(companyId)) {
    const err = new Error('company_id required');
    err.statusCode = 400;
    throw err;
  }

  const adminUuid =
    opts.adminUserId != null && isUuid(opts.adminUserId) ? String(opts.adminUserId).trim() : null;

  const sb = getSupabaseAdmin();
  const { data, error } = await sb.rpc('glovecubs_record_invoice_payment_gc', {
    p_order_id: String(orderId),
    p_company_id: companyId,
    p_amount: amount,
    p_note: opts.note || null,
    p_admin_auth_user_id: adminUuid,
  });
  if (error) throw error;
  if (!data || data.ok !== true) {
    const msg = (data && data.error) || 'glovecubs_record_invoice_payment_gc failed';
    const err = new Error(msg);
    err.statusCode = 400;
    err.arPayload = data;
    throw err;
  }
  return data;
}

module.exports = {
  applyNet30OrderOpen,
  recordInvoicePayment,
};
