/**
 * Early pipeline: sales_prospects + RFQ rollups for admin (not a CRM).
 */

const { getSupabaseAdmin } = require('../lib/supabaseAdmin');
const dataService = require('./dataService');

const OPEN_PROSPECT = new Set(['new', 'contacted', 'quoted', 'negotiating', 'nurture']);
const PROSPECT_STATUSES = new Set(['new', 'contacted', 'quoted', 'negotiating', 'won', 'lost', 'nurture']);
const RFQ_NEEDS_FOLLOWUP = new Set(['pending', 'new', 'reviewing', 'contacted']);

function rowToProspect(r) {
  if (!r) return null;
  return {
    id: r.id,
    company_name: r.company_name || '',
    contact_name: r.contact_name || '',
    email: r.email || '',
    phone: r.phone || '',
    source: r.source || '',
    status: r.status || 'new',
    notes: r.notes || '',
    converted_company_id: r.converted_company_id ?? null,
    created_by_admin_user_id: r.created_by_admin_user_id ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at,
    last_contacted_at: r.last_contacted_at ?? null
  };
}

async function listProspects({ limit = 80, status } = {}) {
  const sb = getSupabaseAdmin();
  let q = sb.from('sales_prospects').select('*').order('updated_at', { ascending: false });
  if (status && String(status).trim()) q = q.eq('status', String(status).trim());
  const lim = Math.min(200, Math.max(1, Number(limit) || 80));
  q = q.limit(lim);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(rowToProspect);
}

async function createProspect(payload, { adminUserId } = {}) {
  const sb = getSupabaseAdmin();
  const row = {
    company_name: String(payload.company_name || '').trim() || 'Unknown',
    contact_name: (payload.contact_name || '').trim() || null,
    email: (payload.email || '').trim() || null,
    phone: (payload.phone || '').trim() || null,
    source: (payload.source || '').trim() || null,
    status: PROSPECT_STATUSES.has(String(payload.status || 'new')) ? String(payload.status || 'new') : 'new',
    notes: (payload.notes || '').trim() || null,
    converted_company_id: payload.converted_company_id != null ? Number(payload.converted_company_id) : null,
    created_by_admin_user_id: adminUserId || null
  };
  const { data, error } = await sb.from('sales_prospects').insert(row).select('*').single();
  if (error) throw error;
  return rowToProspect(data);
}

async function updateProspect(id, body) {
  const sb = getSupabaseAdmin();
  const idNum = parseInt(id, 10);
  const { data: existing, error: e0 } = await sb.from('sales_prospects').select('*').eq('id', idNum).maybeSingle();
  if (e0) throw e0;
  if (!existing) return null;

  const updates = { updated_at: new Date().toISOString() };
  const allowed = ['company_name', 'contact_name', 'email', 'phone', 'source', 'status', 'converted_company_id'];
  for (const k of allowed) {
    if (body[k] !== undefined) {
      if (k === 'converted_company_id') updates[k] = body[k] == null ? null : Number(body[k]);
      else updates[k] = body[k] == null ? null : String(body[k]).trim();
    }
  }
  if (body.append_note && String(body.append_note).trim()) {
    const line = `[${new Date().toISOString().slice(0, 19)}Z] ${String(body.append_note).trim()}`;
    updates.notes = (existing.notes ? `${existing.notes}\n` : '') + line;
  } else if (body.notes !== undefined) {
    updates.notes = body.notes === null ? null : String(body.notes);
  }
  if (body.mark_contacted) {
    updates.status = 'contacted';
  }
  const nextStatus = updates.status !== undefined ? updates.status : existing.status;
  if (nextStatus === 'contacted') {
    updates.last_contacted_at = new Date().toISOString();
  }

  const { data, error } = await sb.from('sales_prospects').update(updates).eq('id', idNum).select('*').single();
  if (error) throw error;
  return rowToProspect(data);
}

/** Public capture: trade show, landing page, partner referral — source + optional notes */
async function capturePublicLead(body) {
  if (body && body.website && String(body.website).trim()) {
    return { ok: true, ignored: true };
  }
  const sb = getSupabaseAdmin();
  const row = {
    company_name: String(body.company_name || '').trim() || 'Unknown',
    contact_name: (body.contact_name || '').trim() || null,
    email: (body.email || '').trim() || null,
    phone: (body.phone || '').trim() || null,
    source: (body.source || 'web_public').trim().slice(0, 120),
    status: 'new',
    notes: (body.notes || '').trim().slice(0, 4000) || null
  };
  if (!row.email && !row.phone) {
    const err = new Error('Email or phone required');
    err.statusCode = 400;
    throw err;
  }
  const { data, error } = await sb.from('sales_prospects').insert(row).select('id').single();
  if (error) throw error;
  return { ok: true, id: data.id };
}

async function getDashboard() {
  const sb = getSupabaseAdmin();
  const [prospectsRes, rfqs] = await Promise.all([
    sb.from('sales_prospects').select('id, status, created_at, updated_at'),
    dataService.getRfqs().catch(() => [])
  ]);

  if (prospectsRes.error) throw prospectsRes.error;
  const plist = prospectsRes.data || [];

  const byP = {};
  plist.forEach((p) => {
    byP[p.status] = (byP[p.status] || 0) + 1;
  });

  const prospects_open = plist.filter((p) => OPEN_PROSPECT.has(p.status)).length;
  const prospects_new = byP.new || 0;

  const rfqList = Array.isArray(rfqs) ? rfqs : [];
  const rfqs_followup = rfqList.filter((r) => RFQ_NEEDS_FOLLOWUP.has(String(r.status || 'pending'))).length;
  const rfqs_quoted = rfqList.filter((r) => String(r.status) === 'quoted').length;
  const rfqs_won = rfqList.filter((r) => String(r.status) === 'won').length;

  const recentProspects = await listProspects({ limit: 40 });
  const openRfqs = rfqList
    .filter((r) => !['won', 'lost', 'expired', 'closed'].includes(String(r.status)))
    .slice(0, 25);

  return {
    counts: {
      prospects_total: plist.length,
      prospects_new,
      prospects_open,
      prospects_won: byP.won || 0,
      rfqs_total: rfqList.length,
      rfqs_needs_followup: rfqs_followup,
      rfqs_quoted,
      rfqs_won
    },
    prospects: recentProspects,
    rfqs_open: openRfqs
  };
}

module.exports = {
  listProspects,
  createProspect,
  updateProspect,
  capturePublicLead,
  getDashboard
};
