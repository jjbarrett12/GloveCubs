/**
 * AR aging: days past due (from invoice_due_at) and bucket totals for open invoice orders.
 * Uses UTC calendar days for stable, simple bucketing.
 */

function roundMoney2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function utcDayStartMs(isoOrDate) {
  const x = new Date(isoOrDate);
  if (Number.isNaN(x.getTime())) return null;
  return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
}

/**
 * Whole calendar days past due (0 if not yet due). Missing due date is treated as 0 days past due.
 */
function daysPastDue(invoiceDueAtIso, asOf = new Date()) {
  if (!invoiceDueAtIso) return 0;
  const dueMs = utcDayStartMs(invoiceDueAtIso);
  const nowMs = utcDayStartMs(asOf);
  if (dueMs == null || nowMs == null) return 0;
  const diff = Math.floor((nowMs - dueMs) / 86400000);
  return Math.max(0, diff);
}

/**
 * @param {number} daysPastDueNonNegative
 * @returns {'current_0_30'|'days_31_60'|'days_61_90'|'days_90_plus'}
 */
function agingBucket(daysPastDueNonNegative) {
  const d = Math.max(0, Math.floor(Number(daysPastDueNonNegative) || 0));
  if (d <= 30) return 'current_0_30';
  if (d <= 60) return 'days_31_60';
  if (d <= 90) return 'days_61_90';
  return 'days_90_plus';
}

function remainingInvoiceBalance(order) {
  const due = Number(order.invoice_amount_due);
  const paid = Number(order.invoice_amount_paid || 0);
  if (!Number.isFinite(due)) return 0;
  const rem = roundMoney2(due - (Number.isFinite(paid) ? paid : 0));
  return rem > 0 ? rem : 0;
}

function isOpenArOrderRow(row) {
  if (!row || row.invoice_ar_opened_at == null) return false;
  const st = String(row.invoice_status || '').toLowerCase();
  if (st !== 'unpaid' && st !== 'partially_paid') return false;
  return remainingInvoiceBalance(row) > 0;
}

/**
 * @param {object[]} orderRows — minimal fields: invoice_*, order_number, id, created_at
 * @param {Date} [asOf]
 */
function aggregateCompanyArAging(orderRows, asOf = new Date()) {
  const buckets = {
    current_0_30: 0,
    days_31_60: 0,
    days_61_90: 0,
    days_90_plus: 0,
  };
  let total_outstanding = 0;
  let max_days_past_due = 0;
  let oldest_invoice_at = null;
  let oldest_open_due_at = null;
  const invoices = [];

  for (const o of orderRows || []) {
    if (!isOpenArOrderRow(o)) continue;
    const rem = remainingInvoiceBalance(o);
    const days = daysPastDue(o.invoice_due_at, asOf);
    const b = agingBucket(days);
    buckets[b] = roundMoney2(buckets[b] + rem);
    total_outstanding = roundMoney2(total_outstanding + rem);
    if (days > max_days_past_due) max_days_past_due = days;

    const opened = o.invoice_ar_opened_at || o.created_at;
    if (opened && (!oldest_invoice_at || String(opened) < String(oldest_invoice_at))) {
      oldest_invoice_at = opened;
    }
    if (o.invoice_due_at && (!oldest_open_due_at || String(o.invoice_due_at) < String(oldest_open_due_at))) {
      oldest_open_due_at = o.invoice_due_at;
    }

    invoices.push({
      order_id: o.id,
      order_number: o.order_number,
      remaining: rem,
      invoice_due_at: o.invoice_due_at,
      days_outstanding: days,
      aging_bucket: b,
    });
  }

  invoices.sort((a, b) => b.days_outstanding - a.days_outstanding);

  return {
    as_of: asOf.toISOString(),
    buckets,
    bucket_labels: {
      current_0_30: 'Current (0–30 days past due)',
      days_31_60: '31–60 days past due',
      days_61_90: '61–90 days past due',
      days_90_plus: '90+ days past due',
    },
    total_outstanding,
    open_invoice_count: invoices.length,
    max_days_past_due,
    oldest_invoice_at,
    oldest_open_due_at,
    invoices: invoices.slice(0, 40),
  };
}

module.exports = {
  daysPastDue,
  agingBucket,
  remainingInvoiceBalance,
  isOpenArOrderRow,
  aggregateCompanyArAging,
};
