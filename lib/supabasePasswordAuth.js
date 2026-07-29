'use strict';

/**
 * Server-only password authentication against Supabase Auth.
 * Uses the anon (publishable) key — never the service role — for signInWithPassword.
 * Does not persist sessions; never validates a custom profile credential.
 */

const { createClient } = require('@supabase/supabase-js');

/** Non-authenticating placeholder for the legacy NOT NULL profile credential column. */
const PASSWORD_HASH_DEPRECATED_SENTINEL = '!supabase_auth_only';

function getSupabaseAuthUrl() {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  return url || null;
}

function getSupabaseAnonKey() {
  const key = (
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  ).trim();
  return key || null;
}

function isSupabasePasswordAuthConfigured() {
  return !!(getSupabaseAuthUrl() && getSupabaseAnonKey());
}

/**
 * Create a non-persisting client for password checks only.
 */
function createPasswordAuthClient() {
  const url = getSupabaseAuthUrl();
  const anon = getSupabaseAnonKey();
  if (!url || !anon) {
    throw new Error('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or anon key for password auth');
  }
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * Validate email/password via Supabase Auth.
 * @param {string} email
 * @param {string} password
 * @param {{ client?: import('@supabase/supabase-js').SupabaseClient }} [deps] test inject only
 * @returns {Promise<{ ok: true, userId: string, email: string } | { ok: false, code: string }>}
 */
async function authenticateCustomerPassword(email, password, deps = {}) {
  const emailNorm = String(email || '').trim().toLowerCase();
  const passwordStr = password != null ? String(password) : '';
  if (!emailNorm || !passwordStr) {
    return { ok: false, code: 'missing_credentials' };
  }
  if (!deps.client && !isSupabasePasswordAuthConfigured()) {
    return { ok: false, code: 'auth_not_configured' };
  }

  const client = deps.client || createPasswordAuthClient();
  try {
    const { data, error } = await client.auth.signInWithPassword({
      email: emailNorm,
      password: passwordStr,
    });
    if (error || !data?.user?.id) {
      return { ok: false, code: 'invalid_credentials' };
    }
    const userId = String(data.user.id);
    const emailOut = (data.user.email || emailNorm).toString().trim().toLowerCase();
    try {
      await client.auth.signOut();
    } catch (_) {
      /* best-effort; session not persisted */
    }
    return { ok: true, userId, email: emailOut };
  } catch (_) {
    return { ok: false, code: 'invalid_credentials' };
  }
}

function isDeprecatedPasswordHashSentinel(value) {
  return String(value || '') === PASSWORD_HASH_DEPRECATED_SENTINEL;
}

module.exports = {
  PASSWORD_HASH_DEPRECATED_SENTINEL,
  isSupabasePasswordAuthConfigured,
  authenticateCustomerPassword,
  isDeprecatedPasswordHashSentinel,
  createPasswordAuthClient,
  getSupabaseAuthUrl,
  getSupabaseAnonKey,
};
