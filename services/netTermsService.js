/**
 * Net terms applications and company commercial fields (gc_commerce only).
 */

const { getSupabaseAdmin } = require('../lib/supabaseAdmin');
const usersService = require('./usersService');
const companiesService = require('./companiesService');
const { formatInvoiceTermsLabel, canPlaceInvoiceOrder } = require('../lib/invoice-terms-guard');

const GC = 'gc_commerce';

function numOrNull(v) {
  if (v === '' || v === undefined || v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapApplicationRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    company_id: r.company_id,
    applicant_user_id: r.applicant_user_id,
    status: r.status,
    business_name: r.business_name,
    contact_name: r.contact_name,
    email: r.email,
    phone: r.phone,
    billing_address_line1: r.billing_address_line1,
    billing_city: r.billing_city,
    billing_state: r.billing_state,
    billing_zip: r.billing_zip,
    ein_tax_id: r.ein_tax_id,
    years_in_business: r.years_in_business,
    requested_credit_limit: r.requested_credit_limit != null ? Number(r.requested_credit_limit) : null,
    monthly_estimated_spend: r.monthly_estimated_spend != null ? Number(r.monthly_estimated_spend) : null,
    trade_references: r.trade_references,
    tax_exempt: !!r.tax_exempt,
    tax_certificate_note: r.tax_certificate_note,
    reviewed_by_user_id: r.reviewed_by_user_id,
    reviewed_at: r.reviewed_at,
    decision_notes: r.decision_notes,
    approved_credit_limit: r.approved_credit_limit != null ? Number(r.approved_credit_limit) : null,
    approved_invoice_terms_code: r.approved_invoice_terms_code,
    approved_invoice_orders_allowed: r.approved_invoice_orders_allowed,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function mapCompanyCommercial(data) {
  if (!data) return null;
  return {
    id: data.id,
    name: data.trade_name || data.name || data.slug || 'Company',
    net_terms_status: data.net_terms_status != null ? data.net_terms_status : 'legacy',
    credit_limit: data.credit_limit != null ? Number(data.credit_limit) : null,
    outstanding_balance: data.outstanding_balance != null ? Number(data.outstanding_balance) : 0,
    invoice_terms_code: data.invoice_terms_code,
    invoice_terms_custom: data.invoice_terms_custom,
    invoice_orders_allowed: !!data.invoice_orders_allowed,
    net_terms_internal_notes: data.net_terms_internal_notes,
    net_terms_reviewed_at: data.net_terms_reviewed_at,
    net_terms_reviewed_by_user_id: data.net_terms_reviewed_by_user_id,
  };
}

function isGcCompanyUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || ''));
}

async function fetchCompanyRowById(companyId) {
  if (!isGcCompanyUuid(companyId)) return null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.schema(GC).from('companies').select('*').eq('id', companyId).maybeSingle();
  if (error) throw error;
  return data;
}

async function fetchCompanyForUser(user) {
  if (!user) return null;
  const id = await companiesService.getCompanyIdForUser(user);
  if (id == null) return null;
  return fetchCompanyRowById(id);
}

async function ensureCompanyLinkedToUser(user, businessName) {
  const supabase = getSupabaseAdmin();
  const name = (businessName || user.company_name || '').toString().trim();
  if (!name) {
    const err = new Error('Business name is required');
    err.statusCode = 400;
    throw err;
  }

  if (user.default_company_id != null && isGcCompanyUuid(user.default_company_id)) {
    return { gcCompanyId: user.default_company_id, created: false };
  }

  const { data: found } = await supabase
    .schema(GC)
    .from('companies')
    .select('id')
    .ilike('trade_name', name)
    .limit(1)
    .maybeSingle();

  if (found?.id) {
    await supabase.schema(GC).from('company_members').upsert(
      { company_id: found.id, user_id: user.id, role: 'member' },
      { onConflict: 'company_id,user_id' },
    );
    await usersService.updateUser(user.id, { default_company_id: found.id, company_name: name });
    return { gcCompanyId: found.id, created: false };
  }

  const baseSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'company';
  const slug = `${baseSlug}-${Date.now().toString(36)}`.slice(0, 64);
  const { data: inserted, error } = await supabase
    .schema(GC)
    .from('companies')
    .insert({
      trade_name: name,
      legal_name: null,
      slug,
      status: 'active',
    })
    .select('id')
    .single();
  if (error) throw error;
  await supabase.schema(GC).from('company_members').insert({
    company_id: inserted.id,
    user_id: user.id,
    role: 'member',
  });
  await usersService.updateUser(user.id, { default_company_id: inserted.id, company_name: name });
  return { gcCompanyId: inserted.id, created: true };
}

async function getLatestApplicationForCompany(companyId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .schema(GC)
    .from('net_terms_applications')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return mapApplicationRow(data);
}

async function getPendingApplicationForCompany(companyId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .schema(GC)
    .from('net_terms_applications')
    .select('*')
    .eq('company_id', companyId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return mapApplicationRow(data);
}

async function getCommercialSnapshotForUserId(userId) {
  const user = await usersService.getUserById(userId);
  if (!user) return null;
  const companyRow = await fetchCompanyForUser(user);
  const company = mapCompanyCommercial(companyRow);
  const appCompanyId = company ? company.id : null;
  let latestApplication = null;
  let pendingApplication = null;
  if (appCompanyId != null) {
    latestApplication = await getLatestApplicationForCompany(appCompanyId);
    pendingApplication = await getPendingApplicationForCompany(appCompanyId);
  }
  const eligible = canPlaceInvoiceOrder(user, companyRow, { orderTotal: 0, skipCreditCheck: true });
  const limit = company && company.credit_limit != null ? Number(company.credit_limit) : null;
  const out = company ? Number(company.outstanding_balance || 0) : 0;
  const availableCredit =
    limit != null && Number.isFinite(limit) ? Math.max(0, limit - (Number.isFinite(out) ? out : 0)) : null;

  const st = company ? company.net_terms_status : 'legacy';
  let portal_notice = null;
  if (st === 'approved' && company && company.invoice_orders_allowed) {
    portal_notice = {
      tone: 'success',
      title: 'Invoice terms active',
      body: `You may select Pay by invoice (${formatInvoiceTermsLabel(companyRow)}) at checkout. Pricing is identical to card or ACH.`,
    };
  } else if (st === 'pending') {
    const appSt = latestApplication && latestApplication.status;
    if (appSt === 'on_hold') {
      portal_notice = {
        tone: 'warning',
        title: 'Application on hold',
        body: 'We paused review of your application. We may contact you for more information.',
      };
    } else {
      portal_notice = {
        tone: 'info',
        title: 'Application under review',
        body: 'We received your application. Use card or ACH at checkout until we approve invoice terms.',
      };
    }
  } else if (st === 'denied') {
    portal_notice = {
      tone: 'error',
      title: 'Application not approved',
      body: 'Invoice checkout is not available for your company. Contact support@glovecubs.com.',
    };
  } else if (st === 'on_hold') {
    portal_notice = {
      tone: 'warning',
      title: 'Account on hold',
      body: 'Invoice checkout is paused for your company. Contact support@glovecubs.com.',
    };
  } else if (st === 'revoked') {
    portal_notice = {
      tone: 'error',
      title: 'Invoice terms revoked',
      body: 'Contact support@glovecubs.com to discuss payment options.',
    };
  } else if (st === 'legacy' && user.is_approved) {
    portal_notice = {
      tone: 'success',
      title: 'Approved for invoice checkout',
      body: 'You can pay by invoice at checkout. Apply for formal credit limits and Net 15/Net 30 terms anytime in Invoice terms.',
    };
  }

  const companyId = company ? company.id : null;
  return {
    company_id: companyId,
    net_terms_status: st,
    invoice_terms_label: formatInvoiceTermsLabel(companyRow),
    invoice_terms_code: company ? company.invoice_terms_code : null,
    invoice_terms_custom: company ? company.invoice_terms_custom : null,
    credit_limit: company ? company.credit_limit : null,
    outstanding_balance: company ? company.outstanding_balance : 0,
    available_credit: availableCredit,
    invoice_orders_allowed: company ? company.invoice_orders_allowed : false,
    has_pending_application: !!pendingApplication,
    latest_application: latestApplication
      ? { id: latestApplication.id, status: latestApplication.status, created_at: latestApplication.created_at }
      : null,
    can_checkout_invoice: eligible.ok,
    invoice_blocked_reason: eligible.ok ? null : eligible.message || null,
    invoice_blocked_code: eligible.ok ? null : eligible.code || null,
    portal_notice: portal_notice,
  };
}

async function submitApplication(userId, body) {
  const user = await usersService.getUserById(userId);
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }
  const businessName = ((body && body.business_name) || '').toString().trim();
  const contactName = ((body && body.contact_name) || '').toString().trim();
  const email = ((body && body.email) || user.email || '').toString().trim().toLowerCase();
  if (!businessName || !contactName || !email) {
    const err = new Error('Business name, contact name, and email are required');
    err.statusCode = 400;
    throw err;
  }

  const { gcCompanyId } = await ensureCompanyLinkedToUser(user, businessName);
  const companyRow = await fetchCompanyRowById(gcCompanyId);
  const coStatus = companyRow && companyRow.net_terms_status != null ? companyRow.net_terms_status : 'legacy';
  if (coStatus === 'approved') {
    const err = new Error('Your company already has approved invoice terms. Contact support to change them.');
    err.statusCode = 400;
    throw err;
  }
  if (coStatus === 'on_hold') {
    const err = new Error('This account is on hold. Contact support@glovecubs.com before submitting an application.');
    err.statusCode = 400;
    throw err;
  }

  const existingPending = await getPendingApplicationForCompany(gcCompanyId);
  const supabase = getSupabaseAdmin();
  if (!isGcCompanyUuid(user.id)) {
    const err = new Error('Account must use Supabase Auth (UUID) for net terms applications.');
    err.statusCode = 400;
    throw err;
  }
  const row = {
    company_id: gcCompanyId,
    applicant_user_id: user.id,
    status: 'pending',
    business_name: businessName,
    contact_name: contactName,
    email,
    phone: (body && body.phone) || user.phone || null,
    billing_address_line1: body && body.billing_address_line1,
    billing_city: body && body.billing_city,
    billing_state: body && body.billing_state,
    billing_zip: body && body.billing_zip,
    ein_tax_id: body && body.ein_tax_id,
    years_in_business: body && body.years_in_business != null ? String(body.years_in_business) : null,
    requested_credit_limit: numOrNull(body && body.requested_credit_limit),
    monthly_estimated_spend: numOrNull(body && body.monthly_estimated_spend),
    trade_references: body && body.trade_references,
    tax_exempt: !!(body && body.tax_exempt),
    tax_certificate_note: body && body.tax_certificate_note,
    updated_at: new Date().toISOString(),
  };

  let saved;
  if (existingPending) {
    const { data, error } = await supabase
      .schema(GC)
      .from('net_terms_applications')
      .update(row)
      .eq('id', existingPending.id)
      .select('*')
      .single();
    if (error) throw error;
    saved = mapApplicationRow(data);
  } else {
    const { data: inserted, error: insErr } = await supabase
      .schema(GC)
      .from('net_terms_applications')
      .insert(row)
      .select('*')
      .single();
    if (insErr) throw insErr;
    saved = mapApplicationRow(inserted);
  }

  if (['legacy', 'denied', 'revoked'].includes(coStatus)) {
    await supabase
      .schema(GC)
      .from('companies')
      .update({ net_terms_status: 'pending', updated_at: new Date().toISOString() })
      .eq('id', gcCompanyId);
  }

  return saved;
}

async function listApplicationsForAdmin({ status } = {}) {
  const supabase = getSupabaseAdmin();
  let q = supabase
    .schema(GC)
    .from('net_terms_applications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);
  if (status && String(status).trim()) {
    q = q.eq('status', String(status).trim());
  }
  const { data, error } = await q;
  if (error) throw error;
  const rows = data || [];
  const companyIds = [...new Set(rows.map((r) => r.company_id).filter(Boolean))];
  const companies = {};
  for (const cid of companyIds) {
    const c = await fetchCompanyRowById(cid);
    if (c) {
      companies[cid] = {
        name: c.trade_name || c.slug || 'Company',
        net_terms_status: c.net_terms_status,
      };
    }
  }
  const out = [];
  for (const r of rows) {
    const u = await usersService.getUserById(r.applicant_user_id);
    out.push({
      ...mapApplicationRow(r),
      company_name: companies[r.company_id] ? companies[r.company_id].name : null,
      company_net_terms_status: companies[r.company_id] ? companies[r.company_id].net_terms_status : null,
      applicant_email: u ? u.email : null,
    });
  }
  return out;
}

const TERMS_CODES = new Set(['net15', 'net30', 'custom']);

async function applyAdminDecision(adminUserId, applicationId, payload) {
  const action = ((payload && payload.action) || '').toString().toLowerCase();
  const supabase = getSupabaseAdmin();
  const appId = String(applicationId || '').trim();
  if (!isGcCompanyUuid(appId)) {
    const err = new Error('Invalid application id');
    err.statusCode = 400;
    throw err;
  }

  const { data: appRow, error: fetchErr } = await supabase
    .schema(GC)
    .from('net_terms_applications')
    .select('*')
    .eq('id', appId)
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!appRow) {
    const err = new Error('Application not found');
    err.statusCode = 404;
    throw err;
  }

  const now = new Date().toISOString();
  const notes = payload && payload.decision_notes != null ? String(payload.decision_notes).trim() : null;

  if (action === 'hold') {
    if (appRow.status !== 'pending') {
      const err = new Error('Can only place pending applications on hold');
      err.statusCode = 400;
      throw err;
    }
    const { data, error } = await supabase
      .schema(GC)
      .from('net_terms_applications')
      .update({
        status: 'on_hold',
        decision_notes: notes,
        reviewed_by_user_id: adminUserId,
        reviewed_at: now,
        updated_at: now,
      })
      .eq('id', appId)
      .select('*')
      .single();
    if (error) throw error;
    return mapApplicationRow(data);
  }

  if (action === 'deny') {
    if (!['pending', 'on_hold'].includes(appRow.status)) {
      const err = new Error('Can only deny pending or on-hold applications');
      err.statusCode = 400;
      throw err;
    }
    const { data, error } = await supabase
      .schema(GC)
      .from('net_terms_applications')
      .update({
        status: 'denied',
        decision_notes: notes,
        reviewed_by_user_id: adminUserId,
        reviewed_at: now,
        updated_at: now,
      })
      .eq('id', appId)
      .select('*')
      .single();
    if (error) throw error;
    await supabase
      .schema(GC)
      .from('companies')
      .update({
        net_terms_status: 'denied',
        invoice_orders_allowed: false,
        net_terms_reviewed_at: now,
        net_terms_reviewed_by_user_id: adminUserId,
        updated_at: now,
      })
      .eq('id', appRow.company_id);
    return mapApplicationRow(data);
  }

  if (action === 'approve') {
    if (!['pending', 'on_hold'].includes(appRow.status)) {
      const err = new Error('Can only approve pending or on-hold applications');
      err.statusCode = 400;
      throw err;
    }
    const code = ((payload && payload.invoice_terms_code) || 'net30').toString().toLowerCase();
    if (!TERMS_CODES.has(code)) {
      const err = new Error('invoice_terms_code must be net15, net30, or custom');
      err.statusCode = 400;
      throw err;
    }
    const custom = (payload && payload.invoice_terms_custom) || null;
    if (code === 'custom' && !(custom && String(custom).trim())) {
      const err = new Error('invoice_terms_custom is required when invoice_terms_code is custom');
      err.statusCode = 400;
      throw err;
    }
    const approvedLimit = numOrNull(payload && payload.approved_credit_limit);
    const invoiceAllowed =
      payload && payload.invoice_orders_allowed !== undefined ? !!payload.invoice_orders_allowed : true;

    const { data, error } = await supabase
      .schema(GC)
      .from('net_terms_applications')
      .update({
        status: 'approved',
        decision_notes: notes,
        reviewed_by_user_id: adminUserId,
        reviewed_at: now,
        approved_credit_limit: approvedLimit,
        approved_invoice_terms_code: code,
        approved_invoice_orders_allowed: invoiceAllowed,
        updated_at: now,
      })
      .eq('id', appId)
      .select('*')
      .single();
    if (error) throw error;

    const coUpdate = {
      net_terms_status: 'approved',
      credit_limit: approvedLimit,
      invoice_terms_code: code,
      invoice_terms_custom: code === 'custom' ? String(custom).trim() : null,
      invoice_orders_allowed: invoiceAllowed,
      net_terms_internal_notes: payload && payload.internal_notes != null ? String(payload.internal_notes) : null,
      net_terms_reviewed_at: now,
      net_terms_reviewed_by_user_id: adminUserId,
      updated_at: now,
    };
    await supabase.schema(GC).from('companies').update(coUpdate).eq('id', appRow.company_id);

    const applicant = await usersService.getUserById(appRow.applicant_user_id);
    if (applicant) {
      await usersService.updateUser(applicant.id, {
        is_approved: 1,
        payment_terms: 'net30',
      });
    }
    return mapApplicationRow(data);
  }

  if (action === 'resume') {
    if (appRow.status !== 'on_hold') {
      const err = new Error('Only on_hold applications can be resumed');
      err.statusCode = 400;
      throw err;
    }
    const { data, error } = await supabase
      .schema(GC)
      .from('net_terms_applications')
      .update({
        status: 'pending',
        updated_at: now,
      })
      .eq('id', appId)
      .select('*')
      .single();
    if (error) throw error;
    return mapApplicationRow(data);
  }

  const err = new Error('Invalid action (approve, deny, hold, resume)');
  err.statusCode = 400;
  throw err;
}

async function updateCompanyCommercial(companyId, payload) {
  await companiesService.updateCompany(companyId, payload);
  const raw = await fetchCompanyRowById(companyId);
  return mapCompanyCommercial(raw);
}

module.exports = {
  submitApplication,
  getCommercialSnapshotForUserId,
  getLatestApplicationForCompany,
  listApplicationsForAdmin,
  applyAdminDecision,
  updateCompanyCommercial,
  fetchCompanyForUser,
  fetchCompanyRowById,
  mapCompanyCommercial,
  formatInvoiceTermsLabel,
};
