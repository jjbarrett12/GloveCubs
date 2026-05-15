/**
 * Server-only Supabase admin client. Uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from process.env only.
 * Key may be JWT (eyJ...) or sb_secret_... format. Never hardcode; never expose to client.
 */
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const hasConfig = !!(url && url.trim() && key && key.trim());

const supabaseAdmin = hasConfig
    ? createClient(url.trim(), key.trim(), {
          auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

function getSupabaseAdmin() {
    if (!supabaseAdmin) {
        throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in Express runtime. Set in .env (local) or host env (prod).');
    }
    return supabaseAdmin;
}

function isSupabaseAdminConfigured() {
    return hasConfig;
}

module.exports = { supabaseAdmin, getSupabaseAdmin, isSupabaseAdminConfigured };
