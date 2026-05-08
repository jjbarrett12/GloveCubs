'use strict';

/**
 * Canonical active company resolution for Express + Next storefront.
 * - Membership in gc_commerce.company_members is authoritative.
 * - public.users.active_company_id is the persisted preference (nullable).
 * - Deterministic ordering: membership company_ids sorted ascending (UUID lexical order).
 * - No company_name / display string authority.
 */

const GC = 'gc_commerce';

function isAuthUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || ''));
}

function isGcCompanyUuid(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(s || ''));
}

function logEvent(payload) {
  console.log(
    JSON.stringify(
      Object.assign({ category: 'active_company', ts: new Date().toISOString() }, payload)
    )
  );
}

/**
 * Pure resolution from already-fetched inputs (tests + server reuse).
 * @param {{ membershipIdsSorted: string[], storedActive: string | null }} params
 */
function computeActiveCompanyResolution({ membershipIdsSorted, storedActive }) {
  const m = (membershipIdsSorted || [])
    .map((x) => String(x || '').trim())
    .filter(isGcCompanyUuid)
    .sort();
  const storedRaw = storedActive != null && storedActive !== '' ? String(storedActive).trim() : null;
  const stored = storedRaw && isGcCompanyUuid(storedRaw) && m.includes(storedRaw) ? storedRaw : null;

  if (m.length === 0) {
    return {
      companyId: null,
      reason: 'no_membership',
      requiresSelection: false,
      memberships: [],
      bootstrapCompanyId: null,
    };
  }
  if (m.length === 1) {
    const only = m[0];
    return {
      companyId: only,
      reason: 'single_membership',
      requiresSelection: false,
      memberships: m,
      bootstrapCompanyId: stored ? null : only,
    };
  }
  if (stored) {
    return {
      companyId: stored,
      reason: 'active_stored',
      requiresSelection: false,
      memberships: m,
      bootstrapCompanyId: null,
    };
  }
  return {
    companyId: null,
    reason: 'requires_company_selection',
    requiresSelection: true,
    memberships: m,
    bootstrapCompanyId: null,
  };
}

/**
 * @param {string} userId
 * @param {{ supabase?: import('@supabase/supabase-js').SupabaseClient }} [options]
 * @returns {Promise<{
 *   companyId: string | null,
 *   reason: string,
 *   requiresSelection: boolean,
 *   memberships: string[],
 * }>}
 */
async function resolveActiveCompanyId(userId, options = {}) {
  const uid = String(userId || '').trim();
  if (!isAuthUuid(uid)) {
    logEvent({ event: 'invalid_user_id', user_id: uid });
    return {
      companyId: null,
      reason: 'invalid_user_id',
      requiresSelection: false,
      memberships: [],
    };
  }

  const { getSupabaseAdmin } = require('./supabaseAdmin');
  const supabase = options.supabase || getSupabaseAdmin();

  const { data: members, error: memErr } = await supabase
    .schema(GC)
    .from('company_members')
    .select('company_id')
    .eq('user_id', uid)
    .order('company_id', { ascending: true });
  if (memErr) throw memErr;
  const membershipIdsSorted = (members || [])
    .map((r) => (r && r.company_id != null ? String(r.company_id) : ''))
    .filter(isGcCompanyUuid);

  const { data: profile, error: profErr } = await supabase
    .from('users')
    .select('active_company_id')
    .eq('id', uid)
    .maybeSingle();
  if (profErr) throw profErr;

  const storedRaw =
    profile && profile.active_company_id != null ? String(profile.active_company_id).trim() : null;
  const storedValid = storedRaw && isGcCompanyUuid(storedRaw) && membershipIdsSorted.includes(storedRaw);

  if (storedRaw && isGcCompanyUuid(storedRaw) && !storedValid) {
    logEvent({ event: 'invalid_stored_membership', user_id: uid, active_company_id: storedRaw });
    await supabase
      .from('users')
      .update({ active_company_id: null, updated_at: new Date().toISOString() })
      .eq('id', uid);
  }

  const storedActive = storedValid ? storedRaw : null;
  const computed = computeActiveCompanyResolution({
    membershipIdsSorted,
    storedActive,
  });

  if (computed.bootstrapCompanyId) {
    logEvent({
      event: 'bootstrap_single_membership',
      user_id: uid,
      company_id: computed.bootstrapCompanyId,
    });
    await supabase
      .from('users')
      .update({
        active_company_id: computed.bootstrapCompanyId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', uid);
  }

  if (computed.reason === 'requires_company_selection') {
    logEvent({
      event: 'fallback_requires_selection',
      user_id: uid,
      membership_count: computed.memberships.length,
    });
  }

  return {
    companyId: computed.companyId,
    reason: computed.reason,
    requiresSelection: computed.requiresSelection,
    memberships: computed.memberships,
  };
}

/**
 * @param {string} userId
 * @param {string} companyId
 * @param {{ supabase?: import('@supabase/supabase-js').SupabaseClient }} [options]
 * @returns {Promise<{ ok: true } | { ok: false, code: string, error: string }>}
 */
async function setActiveCompanyForUser(userId, companyId, options = {}) {
  const uid = String(userId || '').trim();
  const cid = String(companyId || '').trim();
  if (!isAuthUuid(uid)) {
    logEvent({ event: 'switch_invalid_user', user_id: uid });
    return { ok: false, code: 'INVALID_USER', error: 'Invalid user id' };
  }
  if (!isGcCompanyUuid(cid)) {
    logEvent({ event: 'switch_invalid_company', user_id: uid, company_id: cid });
    return { ok: false, code: 'INVALID_COMPANY', error: 'Invalid company id' };
  }

  const { getSupabaseAdmin } = require('./supabaseAdmin');
  const supabase = options.supabase || getSupabaseAdmin();

  const { data: row, error } = await supabase
    .schema(GC)
    .from('company_members')
    .select('company_id')
    .eq('user_id', uid)
    .eq('company_id', cid)
    .maybeSingle();
  if (error) throw error;
  if (!row) {
    logEvent({ event: 'switch_membership_denied', user_id: uid, company_id: cid });
    return { ok: false, code: 'NOT_A_MEMBER', error: 'User is not a member of this company' };
  }

  const { error: upErr } = await supabase
    .from('users')
    .update({ active_company_id: cid, updated_at: new Date().toISOString() })
    .eq('id', uid);
  if (upErr) throw upErr;

  logEvent({ event: 'active_company_set', user_id: uid, company_id: cid });
  return { ok: true };
}

module.exports = {
  isAuthUuid,
  isGcCompanyUuid,
  computeActiveCompanyResolution,
  resolveActiveCompanyId,
  setActiveCompanyForUser,
};
