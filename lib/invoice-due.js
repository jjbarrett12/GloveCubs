'use strict';

/**
 * Calendar due date from company invoice terms (for net30-style orders).
 * @param {object|null|undefined} company - companies row (invoice_terms_code / invoice_terms_custom)
 * @returns {number} days from order date
 */
function netDaysFromInvoiceTerms(company) {
  if (!company) return 30;
  const code = String(company.invoice_terms_code || 'net30').toLowerCase();
  if (code === 'net15') return 15;
  if (code === 'net30') return 30;
  if (code === 'custom') {
    const m = String(company.invoice_terms_custom || '').match(/net\s*(\d+)/i);
    if (m) {
      const d = parseInt(m[1], 10);
      if (Number.isFinite(d)) return Math.min(120, Math.max(1, d));
    }
  }
  return 30;
}

/**
 * @param {string|Date|null|undefined} createdAt
 * @param {object|null|undefined} company
 * @returns {string} ISO timestamp (UTC) for invoice_due_at
 */
function computeInvoiceDueAtIso(createdAt, company) {
  const days = netDaysFromInvoiceTerms(company);
  const d = createdAt ? new Date(createdAt) : new Date();
  const base = Number.isNaN(d.getTime()) ? new Date() : d;
  const due = new Date(base.getTime());
  due.setUTCDate(due.getUTCDate() + days);
  return due.toISOString();
}

module.exports = {
  netDaysFromInvoiceTerms,
  computeInvoiceDueAtIso,
};
