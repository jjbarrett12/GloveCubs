/**
 * Users: all reads and writes via Supabase. Single source of truth.
 */

const { getSupabaseAdmin } = require('../lib/supabaseAdmin');

function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    password: row.password_hash,
    password_hash: row.password_hash,
    company_name: row.company_name || '',
    company_id: row.company_id ?? null,
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
    payment_terms: row.payment_terms || 'credit_card'
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
  return data ? rowToUser(data) : null;
}

async function getUserById(id) {
  const supabase = getSupabaseAdmin();
  const idNum = parseInt(id, 10);
  if (Number.isNaN(idNum)) return null;
  const { data, error } = await supabase.from('users').select('*').eq('id', idNum).maybeSingle();
  if (error) {
    console.error('[usersService] getUserById error', error);
    throw error;
  }
  return data ? rowToUser(data) : null;
}

async function createUser(payload) {
  const supabase = getSupabaseAdmin();
  const insert = {
    email: (payload.email || '').trim().toLowerCase(),
    password_hash: payload.password || payload.password_hash,
    company_name: payload.company_name || null,
    company_id: payload.company_id ?? null,
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
    payment_terms: payload.payment_terms || 'credit_card'
  };
  const { data, error } = await supabase.from('users').insert(insert).select('*').single();
  if (error) throw error;
  return rowToUser(data);
}

async function updateUser(id, payload) {
  const supabase = getSupabaseAdmin();
  const idNum = parseInt(id, 10);
  const updates = { updated_at: new Date().toISOString() };
  const allowed = ['company_name', 'company_id', 'contact_name', 'phone', 'address', 'city', 'state', 'zip', 'is_approved', 'discount_tier', 'password_hash', 'budget_amount', 'budget_period', 'rep_name', 'rep_email', 'rep_phone', 'cases_or_pallets', 'allow_free_upgrades', 'payment_terms'];
  for (const k of allowed) {
    if (payload[k] !== undefined) updates[k] = payload[k];
  }
  const { data, error } = await supabase.from('users').update(updates).eq('id', idNum).select('*').single();
  if (error) throw error;
  return data ? rowToUser(data) : null;
}

async function getAllUsers() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToUser);
}

function getOwnerEmails() {
  const raw = process.env.OWNER_EMAIL || process.env.SITE_OWNER_EMAIL || '';
  return raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
}

async function isAdmin(userIdOrEmail) {
  const supabase = getSupabaseAdmin();
  let email = '';
  const idNum = parseInt(userIdOrEmail, 10);
  if (!Number.isNaN(idNum)) {
    const { data } = await supabase.from('app_admins').select('id').eq('user_id', idNum).maybeSingle();
    if (data) return true;
    const user = await getUserById(idNum);
    email = (user && user.email) ? String(user.email).trim().toLowerCase() : '';
  } else {
    email = String(userIdOrEmail || '').trim().toLowerCase();
    if (email) {
      const { data } = await supabase.from('app_admins').select('id').ilike('email', email).maybeSingle();
      if (data) return true;
    }
  }
  if (email && getOwnerEmails().includes(email)) return true;
  return false;
}

module.exports = {
  getUserByEmail,
  getUserById,
  getAllUsers,
  createUser,
  updateUser,
  isAdmin,
  rowToUser
};
