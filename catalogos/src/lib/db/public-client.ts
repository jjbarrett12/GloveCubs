import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Public-schema Supabase client. Middleware and rate limits use this so the
 * edge bundle does not import the private database connection.
 */
export function getSupabasePublic(useServiceRole = false): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const key = useServiceRole && serviceKey ? serviceKey : anonKey;
  if (!url || !key) {
    throw new Error("Supabase URL and key must be set (SUPABASE_URL, SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY)");
  }
  return createClient(url, key, {
    auth: useServiceRole ? { persistSession: false, autoRefreshToken: false } : undefined,
  });
}
