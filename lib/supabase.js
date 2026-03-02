/**
 * Supabase client for server-side use (CSV import, etc.).
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env.
 */
let client = null;

function getSupabase() {
    if (client !== null) return client;
    const url = process.env.SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) return null;
    try {
        const { createClient } = require('@supabase/supabase-js');
        client = createClient(url, key);
        return client;
    } catch (e) {
        return null;
    }
}

function isConfigured() {
    return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

module.exports = { getSupabase, isConfigured };
