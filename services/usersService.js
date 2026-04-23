/**
 * Portal users: identity root = auth.users (UUID). public.users is the B2B profile row
 * with the same primary key as auth.users(id).
 */

const crypto = require('crypto');
const { getSupabaseAdmin } = require('../lib/supabaseAdmin');
const companiesService = require('./companiesService');

function isAuthUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || ''));
}

/** Resolve auth.users id by email (admin API has no direct get-by-email). */
async function findAuthUserIdByEmail(supabase, email) {
  const target = (email || '').toString().trim().toLowerCase();
  if (!target) return null;
  let page = 1;
  const perPage = 200;
  const maxPages = 50;
  for (let p = 0; p < maxPages; p++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users || [];
    const found = users.find((u) => (u.email || '').toString().trim().toLowerCase() === target);
    if (found?.id) return String(found.id);
    if (users.length < perPage) break;
    page += 1;
  }
  return null;
}

function rowToUser(row, authUser, resolvedCompanyId) {
  if (!row) return null;
  const email = (row.email || (authUser && authUser.email) || '').toString().trim().toLowerCase();
  const cid = resolvedCompanyId != null ? String(resolvedCompanyId) : null;
  return {
    id: String(row.id),
    email,
    password: row.password_hash,
    password_hash: row.password_hash,
    company_name: row.company_name || '',
    company_id: cid,
    default_company_id: cid,
    contact_name: row.contact_name || '',
    phone: row.phone || '',
    address: row.address || '',
    city: row.city || '',
    state: row.state || '',
    zip: row.zip || '',
    is_approved: row.is_approved != null ? row.is_approved : 0,
    discount_tier: row.discount_tier || 'standard',
    created_at: row.created_at,
    updated_at: row.updated_at,
    budget_amount: row.budget_amount ?? null,
    budget_period: row.budget_period || 'monthly',
    rep_name: row.rep_name || '',
    rep_email: row.rep_email || '',
    rep_phone: row.rep_phone || '',
    cases_or_pallets: row.cases_or_pallets || '',
    allow_free_upgrades: row.allow_free_upgrades || false,
    payment_terms: row.payment_terms || 'credit_card',
    pricing_tier_source: row.pricing_tier_source || 'manual',
    pricing_tier_evaluated_at: row.pricing_tier_evaluated_at ?? null,
  };
}

async function getUserByEmail(email) {
  const supabase = getSupabaseAdmin();
  const emailLower = (email || '').toString().trim().toLowerCase();
  if (!emailLower) return null;
  const { data, error } = await supabase.from('users').select('*').ilike('email', emailLower).maybeSingle();
  if (error) {
    console.error('[usersService] getUserByEmail error', error);
    throw error;
  }
  if (!data) return null;
  const { data: authWrap } = await supabase.auth.admin.getUserById(String(data.id));
  const authUser = authWrap?.user || null;
  const cid = await companiesService.getCompanyIdForUser({ id: String(data.id) });
  return rowToUser(data, authUser, cid);
}

async function getUserById(id) {
  if (!isAuthUuid(id)) return null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('users').select('*').eq('id', String(id)).maybeSingle();
  if (error) {
    console.error('[usersService] getUserById error', error);
    throw error;
  }
  if (!data) return null;
  const { data: authWrap } = await supabase.auth.admin.getUserById(String(id));
  const cid = await companiesService.getCompanyIdForUser({ id: String(data.id) });
  return rowToUser(data, authWrap?.user || null, cid);
}

async function createUser(payload) {
  const supabase = getSupabaseAdmin();
  const passwordHash =
    payload.password_hash != null && payload.password_hash !== ''
      ? payload.password_hash
      : payload.password;
  const email = (payload.email || '').trim().toLowerCase();
  if (!email) throw new Error('email required');

  const plainForAuth =
    payload.plain_password != null && String(payload.plain_password).length > 0
      ? String(payload.plain_password)
      : null;
  const authPassword = plainForAuth || `${crypto.randomBytes(24).toString('base64url')}Aa0!zq`;

  let authUid = null;
  let authCreatedHere = false;
  try {
    const { data: authCreateData, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password: authPassword,
      email_confirm: true,
    });

    if (!createErr && authCreateData?.user?.id) {
      authUid = String(authCreateData.user.id);
      authCreatedHere = true;
    } else if (createErr) {
      const msg = String(createErr.message || '').toLowerCase();
      const dup =
        msg.includes('registered') ||
        msg.includes('already been') ||
        msg.includes('already exists') ||
        msg.includes('duplicate');
      if (dup) {
        authUid = await findAuthUserIdByEmail(supabase, email);
      }
      if (!authUid) throw createErr;
    } else {
      throw new Error('Auth user creation returned no user id');
    }

    const { data: existingRow } = await supabase.from('users').select('id').eq('id', authUid).maybeSingle();
    if (existingRow) {
      throw new Error(
        'That email already has a portal profile. Use a different email or contact support.',
      );
    }

    const insert = {
      id: authUid,
      email,
      password_hash: passwordHash,
      company_name: payload.company_name || null,
      contact_name: payload.contact_name || null,
      phone: payload.phone || null,
      address: payload.address || null,
      city: payload.city || null,
      state: payload.state || null,
      zip: payload.zip || null,
      is_approved: payload.is_approved != null ? payload.is_approved : 0,
      discount_tier: payload.discount_tier || 'standard',
      budget_amount: payload.budget_amount ?? null,
      budget_period: payload.budget_period || 'monthly',
      rep_name: payload.rep_name || null,
      rep_email: payload.rep_email || null,
      rep_phone: payload.rep_phone || null,
      cases_or_pallets: payload.cases_or_pallets || null,
      allow_free_upgrades: payload.allow_free_upgrades || false,
      payment_terms: payload.payment_terms || 'credit_card',
    };

    const { error: insErr } = await supabase.from('users').insert(insert);
    if (insErr) throw insErr;

    if (payload.company_id != null && companiesService.isGcCompanyUuid(payload.company_id)) {
      await companiesService.addCompanyMember(authUid, String(payload.company_id), 'member');
    }

    return getUserById(authUid);
  } catch (e) {
    if (authCreatedHere && authUid) {
      await supabase.auth.admin.deleteUser(authUid).catch(() => {});
    }
    await supabase.from('users').delete().eq('id', authUid).catch(() => {});
    throw e;
  }
}

async function updateUser(id, payload) {
  if (!isAuthUuid(id)) return null;
  const supabase = getSupabaseAdmin();
  const updates = { updated_at: new Date().toISOString() };
  const allowed = [
    'company_name',
    'contact_name',
    'phone',
    'phone_e164',
    'address',
    'city',
    'state',
    'zip',
    'is_approved',
    'discount_tier',
    'password_hash',
    'budget_amount',
    'budget_period',
    'rep_name',
    'rep_email',
    'rep_phone',
    'cases_or_pallets',
    'allow_free_upgrades',
    'payment_terms',
    'pricing_tier_source',
    'pricing_tier_evaluated_at',
  ];
  for (const k of allowed) {
    if (payload[k] !== undefined) updates[k] = payload[k];
  }
  if (payload.default_company_id !== undefined && payload.default_company_id != null && payload.default_company_id !== '') {
    if (companiesService.isGcCompanyUuid(payload.default_company_id)) {
      await companiesService.addCompanyMember(String(id), String(payload.default_company_id), 'member');
    }
  }

  const { error } = await supabase.from('users').update(updates).eq('id', String(id));
  if (error) throw error;
  return getUserById(id);
}

async function getAllUsers() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  const { data: mems } = await supabase.schema('gc_commerce').from('company_members').select('user_id, company_id');
  const firstCompanyByUser = new Map();
  for (const m of mems || []) {
    const uid = String(m.user_id);
    if (!firstCompanyByUser.has(uid) && m.company_id != null) {
      firstCompanyByUser.set(uid, String(m.company_id));
    }
  }
  const out = [];
  for (const row of data || []) {
    const { data: authWrap } = await supabase.auth.admin.getUserById(String(row.id));
    const cid = firstCompanyByUser.get(String(row.id)) ?? null;
    out.push(rowToUser(row, authWrap?.user || null, cid));
  }
  return out;
}

/**
 * Admin authorization: public.app_admins.auth_user_id only.
 */
async function isAdmin(userIdOrEmail) {
  const s = String(userIdOrEmail || '').trim();
  if (!s) return false;
  const supabase = getSupabaseAdmin();

  if (!isAuthUuid(s)) return false;

  const user = await getUserById(s);
  if (!user) return false;

  const { data: adm } = await supabase
    .from('app_admins')
    .select('auth_user_id')
    .eq('auth_user_id', s)
    .limit(1)
    .maybeSingle();
  if (adm) return true;

  return false;
}

async function listAppAdminsForCockpit() {
  const supabase = getSupabaseAdmin();
  const { data: rows, error } = await supabase
    .from('app_admins')
    .select('auth_user_id, email, created_at')
    .order('created_at', { ascending: true });
  if (error) throw error;
  const out = [];
  for (const r of rows || []) {
    const authId = r.auth_user_id ? String(r.auth_user_id) : null;
    const u = authId ? await getUserById(authId) : null;
    const email = (u && u.email) || r.email || '';
    out.push({
      admin_table_id: authId,
      auth_user_id: authId,
      email: email || null,
      contact_name: u ? u.contact_name : null,
      is_approved: u ? u.is_approved : null,
      company_name: u ? u.company_name : null,
      badge: 'app_admin',
      created_at: r.created_at,
      record_type: 'app_admins',
    });
  }
  return { roster: out, owner_emails_from_env: [] };
}

module.exports = {
  getUserByEmail,
  getUserById,
  getAllUsers,
  createUser,
  updateUser,
  isAdmin,
  rowToUser,
  listAppAdminsForCockpit,
  findAuthUserIdByEmail,
  isAuthUuid,
};
