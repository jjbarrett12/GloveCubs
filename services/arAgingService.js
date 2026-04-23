'use strict';

const { getSupabaseAdmin } = require('../lib/supabaseAdmin');
const { aggregateCompanyArAging } = require('../lib/arAging');

const GC = 'gc_commerce';

function isUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || ''));
}

async function fetchOpenArOrderRowsForCompany(companyId) {
  if (!isUuid(companyId)) return [];
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .schema(GC)
    .from('orders')
    .select(
      'id, order_number, company_id, status, created_at, invoice_ar_opened_at, invoice_due_at, invoice_amount_due, invoice_amount_paid, invoice_status, payment_method'
    )
    .eq('company_id', companyId)
    .not('invoice_ar_opened_at', 'is', null)
    .in('invoice_status', ['unpaid', 'partially_paid']);
  if (error) throw error;
  return data || [];
}

async function getCompanyArAging(companyId, asOf = new Date()) {
  const rows = await fetchOpenArOrderRowsForCompany(companyId);
  return aggregateCompanyArAging(rows, asOf);
}

async function fetchAllOpenArOrderRows() {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .schema(GC)
    .from('orders')
    .select(
      'id, order_number, company_id, status, created_at, invoice_ar_opened_at, invoice_due_at, invoice_amount_due, invoice_amount_paid, invoice_status'
    )
    .not('invoice_ar_opened_at', 'is', null)
    .in('invoice_status', ['unpaid', 'partially_paid']);
  if (error) throw error;
  return data || [];
}

module.exports = {
  fetchOpenArOrderRowsForCompany,
  getCompanyArAging,
  fetchAllOpenArOrderRows,
};
