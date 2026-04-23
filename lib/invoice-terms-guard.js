/**
 * Single place to decide whether an authenticated user may place an order with payment_method net30 (invoice / open terms).
 * Pricing is unchanged; this only gates the payment method.
 */

const LEGACY_STATUSES = new Set(['legacy', null, undefined, '']);

function formatInvoiceTermsLabel(company) {
  if (!company) return 'Net terms';
  const code = (company.invoice_terms_code || '').toLowerCase();
  if (code === 'custom' && company.invoice_terms_custom && String(company.invoice_terms_custom).trim()) {
    return String(company.invoice_terms_custom).trim();
  }
  if (code === 'net15') return 'Net 15';
  if (code === 'net30') return 'Net 30';
  return 'Net terms';
}

function roundMoney2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Server-side credit check for Net 30: outstanding_balance + order_total vs credit_limit (cent-safe).
 * If company has no finite credit_limit, returns ok: true and credit: null.
 *
 * @param {object|null|undefined} company
 * @param {number} orderTotal
 * @returns {{ ok: boolean, code?: string, message?: string, credit?: object|null }}
 */
function evaluateNet30Credit(company, orderTotal) {
  if (!company) {
    return { ok: true, credit: null };
  }
  const limitRaw = company.credit_limit;
  if (limitRaw == null || limitRaw === '') {
    return { ok: true, credit: null };
  }
  const limit = Number(limitRaw);
  if (!Number.isFinite(limit) || limit < 0) {
    return { ok: true, credit: null };
  }
  const out = Number(company.outstanding_balance || 0);
  const outSafe = Number.isFinite(out) ? out : 0;
  const order = Number(orderTotal);
  const orderSafe = Number.isFinite(order) && order >= 0 ? order : 0;
  const outCents = Math.round(outSafe * 100);
  const orderCents = Math.round(orderSafe * 100);
  const limitCents = Math.round(limit * 100);
  const projectedCents = outCents + orderCents;
  const availableCents = limitCents - outCents;
  const credit = {
    credit_limit: roundMoney2(limit),
    outstanding_balance: roundMoney2(outSafe),
    order_total: roundMoney2(orderSafe),
    projected_outstanding: roundMoney2(projectedCents / 100),
    available_credit: roundMoney2(Math.max(0, availableCents / 100)),
    within_limit: projectedCents <= limitCents,
  };
  if (projectedCents > limitCents) {
    return {
      ok: false,
      code: 'CREDIT_LIMIT_EXCEEDED',
      message:
        'This order would exceed your approved credit limit. Pay by card or ACH, or contact your account representative.',
      credit,
    };
  }
  return { ok: true, credit };
}

/**
 * @param {object} user - usersService row
 * @param {object|null} company - companies row with commercial columns (or null)
 * @param {{ orderTotal?: number, skipCreditCheck?: boolean }} [opts]
 * @returns {{ ok: boolean, code?: string, message?: string, credit?: object }}
 */
function canPlaceInvoiceOrder(user, company, opts = {}) {
  if (!user) {
    return { ok: false, code: 'auth', message: 'Sign in required for invoice checkout.' };
  }
  const orderTotal = Number(opts.orderTotal);
  const totalOk = Number.isFinite(orderTotal) && orderTotal >= 0;
  const skipCredit = opts.skipCreditCheck === true;

  const st = company && company.net_terms_status != null ? String(company.net_terms_status) : 'legacy';
  const isLegacy = LEGACY_STATUSES.has(st) || st === 'legacy';

  if (!company || isLegacy) {
    if (user.is_approved) {
      if (!skipCredit && totalOk && company) {
        const ev = evaluateNet30Credit(company, orderTotal);
        if (!ev.ok) {
          return { ok: false, code: ev.code, message: ev.message, credit: ev.credit };
        }
      }
      return { ok: true, code: 'legacy_approved' };
    }
    return {
      ok: false,
      code: 'not_approved',
      message: 'Net terms require account approval. Use card or ACH, or apply for invoice terms in your account portal.',
    };
  }

  if (st === 'pending') {
    return {
      ok: false,
      code: 'pending_review',
      message: 'Your invoice terms application is under review. Use card or ACH for now, or check back after approval.',
    };
  }

  if (st === 'denied') {
    return {
      ok: false,
      code: 'denied',
      message: 'Invoice checkout is not available for this account. Contact support@glovecubs.com.',
    };
  }
  if (st === 'on_hold') {
    return {
      ok: false,
      code: 'on_hold',
      message: 'Your account is on hold. Contact support@glovecubs.com before placing invoice orders.',
    };
  }
  if (st === 'revoked') {
    return {
      ok: false,
      code: 'revoked',
      message: 'Invoice terms have been revoked for this account. Contact support@glovecubs.com.',
    };
  }

  if (st === 'approved') {
    if (!company.invoice_orders_allowed) {
      return {
        ok: false,
        code: 'invoice_disabled',
        message: 'Invoice checkout is not enabled for this account. Use card or ACH.',
      };
    }
    if (!skipCredit && totalOk) {
      const ev = evaluateNet30Credit(company, orderTotal);
      if (!ev.ok) {
        return { ok: false, code: ev.code, message: ev.message, credit: ev.credit };
      }
    }
    return { ok: true, code: 'approved' };
  }

  return {
    ok: false,
    code: 'unknown',
    message: 'Invoice checkout is not available. Contact support@glovecubs.com.',
  };
}

module.exports = {
  formatInvoiceTermsLabel,
  evaluateNet30Credit,
  canPlaceInvoiceOrder,
};
