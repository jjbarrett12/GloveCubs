/**
 * Supabase client for job queue operations
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${key}. ` +
      `Ensure it is set in your environment or .env.local file.`
    );
  }
  return value;
}

let _supabaseAdmin: SupabaseClient | null = null;
let _supabaseCatalogos: SupabaseClient | null = null;

/**
 * Get the Supabase admin client (singleton with lazy initialization)
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    const supabaseUrl = getEnvOrThrow('NEXT_PUBLIC_SUPABASE_URL');
    const supabaseServiceKey = getEnvOrThrow('SUPABASE_SERVICE_ROLE_KEY');

    _supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return _supabaseAdmin;
}

/**
 * Get Supabase admin client scoped to catalogos schema (for RPCs that live in catalogos).
 */
export function getSupabaseCatalogos(): SupabaseClient {
  if (!_supabaseCatalogos) {
    const supabaseUrl = getEnvOrThrow('NEXT_PUBLIC_SUPABASE_URL');
    const supabaseServiceKey = getEnvOrThrow('SUPABASE_SERVICE_ROLE_KEY');
    _supabaseCatalogos = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        headers: { 'Accept-Profile': 'catalogos', 'Content-Profile': 'catalogos' },
      },
    });
  }
  return _supabaseCatalogos;
}

// For backwards compatibility - lazy getter
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getSupabaseAdmin() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
