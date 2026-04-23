/**
 * Companies: single source gc_commerce.companies (UUID) + gc_commerce.company_members.
 */

const { getSupabaseAdmin } = require('../lib/supabaseAdmin');

const GC = 'gc_commerce';

function isGcCompanyUuid(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(s || ''));
}

function mapCompanyRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    name: (r.trade_name || r.slug || 'Company').trim() || 'Company',
    trade_name: r.trade_name,
    slug: r.slug,
    status: r.status,
    default_gross_margin_percent:
      r.default_gross_margin_percent != null ? Number(r.default_gross_margin_percent) : 30,
    created_at: r.created_at,
    updated_at: r.updated_at,
    net_terms_status: r.net_terms_status != null ? r.net_terms_status : 'legacy',
    credit_limit: r.credit_limit != null ? Number(r.credit_limit) : null,
    outstanding_balance: r.outstanding_balance != null ? Number(r.outstanding_balance) : 0,
    invoice_terms_code: r.invoice_terms_code,
    invoice_terms_custom: r.invoice_terms_custom,
    invoice_orders_allowed: !!r.invoice_orders_allowed,
    net_terms_internal_notes: r.net_terms_internal_notes,
    net_terms_reviewed_at: r.net_terms_reviewed_at,
    net_terms_reviewed_by_user_id: r.net_terms_reviewed_by_user_id,
  };
}

async function getCompanies() {
  const supabase = getSupabaseAdmin();
  const { data: rows, error } = await supabase
    .schema(GC)
    .from('companies')
    .select('*')
    .order('trade_name');
  if (error) {
    console.error('[companiesService] getCompanies error', error);
    throw error;
  }
  return (rows || []).map(mapCompanyRow);
}

async function getCompanyById(id) {
  if (!isGcCompanyUuid(id)) return null;
  const supabase = getSupabaseAdmin();
  const { data: row, error } = await supabase.schema(GC).from('companies').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return mapCompanyRow(row);
}

async function getCompanyIdForUser(user) {
  if (!user) return null;
  const ids = await getCompanyIdsForUser(user);
  return ids.length ? ids[0] : null;
}

async function addCompanyMember(userId, companyId, role = 'member') {
  if (!isGcCompanyUuid(companyId)) {
    const err = new Error('Invalid company id');
    err.statusCode = 400;
    throw err;
  }
  const uid = (userId || '').toString().trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uid)) {
    const err = new Error('Invalid user id');
    err.statusCode = 400;
    throw err;
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.schema(GC).from('company_members').insert({
    user_id: uid,
    company_id: String(companyId),
    role: role || 'member',
  });
  if (error && String(error.code) !== '23505') throw error;
}

async function getCompanyIdsForUser(user) {
  if (!user || !isGcCompanyUuid(user.id)) return [];
  const supabase = getSupabaseAdmin();
  const ids = new Set();
  const { data: members } = await supabase
    .schema(GC)
    .from('company_members')
    .select('company_id')
    .eq('user_id', user.id);
  (members || []).forEach((m) => {
    if (m.company_id != null) ids.add(m.company_id);
  });
  return [...ids];
}

async function getCustomerManufacturerPricing() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.schema(GC).from('customer_manufacturer_pricing').select('*');
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id,
    company_id: r.company_id,
    manufacturer_id: r.manufacturer_id,
    gross_margin_percent: r.margin_percent ?? r.gross_margin_percent,
    margin_percent: r.margin_percent ?? r.gross_margin_percent,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}

async function createCompany(payload) {
  const supabase = getSupabaseAdmin();
  const name = (payload.name || '').toString().trim();
  if (!name) {
    const err = new Error('Company name is required');
    err.statusCode = 400;
    throw err;
  }
  const baseSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'company';
  const slug = `${baseSlug}-${Date.now().toString(36)}`.slice(0, 64);
  const { data, error } = await supabase
    .schema(GC)
    .from('companies')
    .insert({
      trade_name: name,
      legal_name: null,
      slug,
      status: 'active',
    })
    .select('*')
    .single();
  if (error) throw error;
  return getCompanyById(data.id);
}

const TERMS_CODES = new Set(['net15', 'net30', 'custom']);

async function updateCompany(id, payload) {
  if (!isGcCompanyUuid(id)) {
    const err = new Error('Invalid company id');
    err.statusCode = 400;
    throw err;
  }
  const supabase = getSupabaseAdmin();
  const updates = { updated_at: new Date().toISOString() };

  if (payload.name !== undefined) {
    const n = (payload.name || '').toString().trim();
    if (!n) {
      const err = new Error('Company name cannot be empty');
      err.statusCode = 400;
      throw err;
    }
    updates.trade_name = n;
  }

  if (payload.default_gross_margin_percent !== undefined) {
    const p = Number(payload.default_gross_margin_percent);
    if (Number.isNaN(p) || p < 0 || p >= 100) {
      const err = new Error('default_gross_margin_percent must be 0–99.99');
      err.statusCode = 400;
      throw err;
    }
    updates.default_gross_margin_percent = p;
  }

  if (payload.net_terms_status !== undefined) {
    const v = String(payload.net_terms_status);
    const allowed = ['legacy', 'pending', 'approved', 'denied', 'on_hold', 'revoked'];
    if (!allowed.includes(v)) {
      const err = new Error('Invalid net_terms_status');
      err.statusCode = 400;
      throw err;
    }
    updates.net_terms_status = v;
  }

  if (payload.credit_limit !== undefined) {
    updates.credit_limit =
      payload.credit_limit === null || payload.credit_limit === '' ? null : Number(payload.credit_limit);
    if (updates.credit_limit != null && !Number.isFinite(updates.credit_limit)) {
      const err = new Error('credit_limit must be a number or null');
      err.statusCode = 400;
      throw err;
    }
  }

  if (payload.outstanding_balance !== undefined) {
    const ob = Number(payload.outstanding_balance);
    if (!Number.isFinite(ob)) {
      const err = new Error('outstanding_balance must be a number');
      err.statusCode = 400;
      throw err;
    }
    updates.outstanding_balance = ob;
  }

  if (payload.invoice_terms_code !== undefined) {
    const c =
      payload.invoice_terms_code === null || payload.invoice_terms_code === ''
        ? null
        : String(payload.invoice_terms_code).toLowerCase();
    if (c && !TERMS_CODES.has(c)) {
      const err = new Error('invoice_terms_code must be net15, net30, or custom');
      err.statusCode = 400;
      throw err;
    }
    updates.invoice_terms_code = c;
  }

  if (payload.invoice_terms_custom !== undefined) {
    updates.invoice_terms_custom = payload.invoice_terms_custom
      ? String(payload.invoice_terms_custom).trim()
      : null;
  }

  if (payload.invoice_orders_allowed !== undefined) {
    updates.invoice_orders_allowed = !!payload.invoice_orders_allowed;
  }

  if (payload.net_terms_internal_notes !== undefined) {
    updates.net_terms_internal_notes = payload.net_terms_internal_notes
      ? String(payload.net_terms_internal_notes)
      : null;
  }

  if (payload.net_terms_reviewed_at !== undefined) {
    updates.net_terms_reviewed_at = payload.net_terms_reviewed_at || null;
  }

  if (payload.net_terms_reviewed_by_user_id !== undefined) {
    updates.net_terms_reviewed_by_user_id = payload.net_terms_reviewed_by_user_id || null;
  }

  if (Object.keys(updates).length <= 1) return getCompanyById(id);

  const { error } = await supabase.schema(GC).from('companies').update(updates).eq('id', id);
  if (error) throw error;
  return getCompanyById(id);
}

module.exports = {
  isGcCompanyUuid,
  getCompanies,
  getCompanyById,
  getCompanyIdForUser,
  getCompanyIdsForUser,
  addCompanyMember,
  getCustomerManufacturerPricing,
  createCompany,
  updateCompany,
};
