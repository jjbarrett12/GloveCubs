/**
 * Canonical pricing tier definitions (Supabase). Single discount map feeds commerce-pricing.
 */

const { getSupabaseAdmin } = require('../lib/supabaseAdmin');

function mapTierRow(r) {
  if (!r) return null;
  return {
    code: r.code,
    display_name: r.display_name,
    discount_percent: r.discount_percent != null ? Number(r.discount_percent) : 0,
    active: !!r.active,
    sort_priority: r.sort_priority != null ? Number(r.sort_priority) : 0,
    require_is_approved: !!r.require_is_approved,
    min_spend_ytd: r.min_spend_ytd != null ? Number(r.min_spend_ytd) : null,
    min_spend_trailing_30: r.min_spend_trailing_30 != null ? Number(r.min_spend_trailing_30) : null,
    min_spend_trailing_60: r.min_spend_trailing_60 != null ? Number(r.min_spend_trailing_60) : null,
    min_spend_trailing_90: r.min_spend_trailing_90 != null ? Number(r.min_spend_trailing_90) : null,
    min_spend_calendar_month: r.min_spend_calendar_month != null ? Number(r.min_spend_calendar_month) : null,
    internal_notes: r.internal_notes || null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

/** For getPricingContext — same keys used by commerce-pricing. */
async function getTierDiscountMap() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('pricing_tiers')
    .select('code, discount_percent')
    .eq('active', true);
  if (error) {
    console.error('[pricingTiersService] getTierDiscountMap', error);
    throw error;
  }
  const map = {};
  for (const row of data || []) {
    const c = String(row.code || '').toLowerCase();
    if (!c) continue;
    const p = Number(row.discount_percent);
    map[c] = Number.isFinite(p) && p >= 0 ? p : 0;
  }
  if (map.standard === undefined) map.standard = 0;
  return map;
}

async function listTiersForAdmin() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('pricing_tiers').select('*').order('sort_priority', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapTierRow);
}

async function listActiveTiersForEvaluation() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('pricing_tiers')
    .select('*')
    .eq('active', true)
    .order('sort_priority', { ascending: false })
    .order('code', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapTierRow);
}

async function getTierByCode(code) {
  const supabase = getSupabaseAdmin();
  const c = String(code || '').toLowerCase();
  if (!c) return null;
  const { data, error } = await supabase.from('pricing_tiers').select('*').eq('code', c).maybeSingle();
  if (error) throw error;
  return mapTierRow(data);
}

async function upsertTier(code, payload) {
  const supabase = getSupabaseAdmin();
  const c = String(code || '').toLowerCase().trim();
  if (!c) {
    const err = new Error('Tier code required');
    err.statusCode = 400;
    throw err;
  }
  const row = {
    code: c,
    updated_at: new Date().toISOString(),
  };
  if (payload.display_name !== undefined) row.display_name = String(payload.display_name).trim() || c;
  if (payload.discount_percent !== undefined) {
    const p = Number(payload.discount_percent);
    if (!Number.isFinite(p) || p < 0 || p > 100) {
      const err = new Error('discount_percent must be 0–100');
      err.statusCode = 400;
      throw err;
    }
    row.discount_percent = p;
  }
  if (payload.active !== undefined) row.active = !!payload.active;
  if (payload.sort_priority !== undefined) row.sort_priority = parseInt(payload.sort_priority, 10) || 0;
  if (payload.require_is_approved !== undefined) row.require_is_approved = !!payload.require_is_approved;
  const nums = [
    'min_spend_ytd',
    'min_spend_trailing_30',
    'min_spend_trailing_60',
    'min_spend_trailing_90',
    'min_spend_calendar_month',
  ];
  for (const k of nums) {
    if (payload[k] !== undefined) {
      if (payload[k] === null || payload[k] === '') row[k] = null;
      else {
        const n = Number(payload[k]);
        row[k] = Number.isFinite(n) ? n : null;
      }
    }
  }
  if (payload.internal_notes !== undefined) row.internal_notes = payload.internal_notes ? String(payload.internal_notes) : null;

  const { data: existing } = await supabase.from('pricing_tiers').select('code').eq('code', c).maybeSingle();
  if (existing) {
    const { data, error } = await supabase.from('pricing_tiers').update(row).eq('code', c).select('*').single();
    if (error) throw error;
    return mapTierRow(data);
  }
  if (!row.display_name) row.display_name = c;
  if (row.discount_percent === undefined) row.discount_percent = 0;
  if (row.active === undefined) row.active = true;
  if (row.sort_priority === undefined) row.sort_priority = 0;
  if (row.require_is_approved === undefined) row.require_is_approved = false;
  const { data, error } = await supabase.from('pricing_tiers').insert(row).select('*').single();
  if (error) throw error;
  return mapTierRow(data);
}

async function insertAuditLog({ userId, oldTier, newTier, reason, source, metricsSnapshot }) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('pricing_tier_audit_log').insert({
    user_id: userId,
    old_tier_code: oldTier != null ? String(oldTier) : null,
    new_tier_code: String(newTier),
    reason: reason != null ? String(reason) : null,
    source: String(source),
    metrics_snapshot: metricsSnapshot || null,
  });
  if (error) console.error('[pricingTiersService] insertAuditLog', error);
}

async function listAuditForUser(userId, limit = 50) {
  const supabase = getSupabaseAdmin();
  const uid = String(userId || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uid)) return [];
  const { data, error } = await supabase
    .from('pricing_tier_audit_log')
    .select('*')
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
    .limit(Math.min(200, Math.max(1, limit)));
  if (error) throw error;
  return data || [];
}

module.exports = {
  getTierDiscountMap,
  listTiersForAdmin,
  listActiveTiersForEvaluation,
  getTierByCode,
  upsertTier,
  insertAuditLog,
  listAuditForUser,
};
