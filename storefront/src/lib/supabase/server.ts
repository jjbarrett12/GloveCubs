/**
 * Server-only Supabase admin client. Do not import into client components.
 * Uses SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (server env only).
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let cached: ReturnType<typeof createClient<Database>> | null = null;

function createAdminClient() {
  if (!supabaseUrl) {
    throw new Error("Missing SUPABASE_URL environment variable");
  }
  if (!supabaseServiceKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable");
  }
  return createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });
}

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseServiceKey);
}

export function getSupabaseAdmin() {
  if (!cached) {
    cached = createAdminClient();
  }
  return cached;
}

/** Singleton admin client; throws if env vars are missing. Use getSupabaseAdmin() in try/catch or check isSupabaseConfigured() first. */
export const supabaseAdmin = new Proxy({} as ReturnType<typeof createClient<Database>>, {
  get(_, prop) {
    return (getSupabaseAdmin() as Record<string, unknown>)[prop as string];
  },
});

export type ServerSupabase = ReturnType<typeof getSupabaseAdmin>;

/** @deprecated Use getSupabaseAdmin() and check isSupabaseConfigured() first. */
export function createServerSupabase(): ServerSupabase {
  return getSupabaseAdmin();
}
