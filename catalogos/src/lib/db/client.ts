import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getClient(useServiceRole = false) {
  const key = useServiceRole && serviceKey ? serviceKey : anonKey;
  if (!url || !key) {
    throw new Error("Supabase URL and key must be set (SUPABASE_URL, SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY)");
  }
  return createClient<Database>(url, key, {
    auth: useServiceRole ? { persistSession: false, autoRefreshToken: false } : undefined,
  });
}

/** Client for server-side with optional service role (ingestion, publish). */
export function getSupabase(useServiceRole = false) {
  return getClient(useServiceRole);
}

/**
 * Client that targets the catalogos schema (PostgREST Accept-Profile / Content-Profile).
 * Use for all CatalogOS tables: suppliers, import_batches, supplier_products_raw, etc.
 * IDs are UUIDs (strings).
 */
export function getSupabaseCatalogos(useServiceRole = true): SupabaseClient {
  const key = useServiceRole && serviceKey ? serviceKey : anonKey;
  if (!url || !key) {
    throw new Error("Supabase URL and key must be set for CatalogOS");
  }
  return createClient(url, key, {
    auth: useServiceRole ? { persistSession: false, autoRefreshToken: false } : undefined,
    global: {
      headers: {
        "Accept-Profile": "catalogos",
        "Content-Profile": "catalogos",
      },
    },
  });
}

export function isSupabaseConfigured() {
  return !!(url && (anonKey || serviceKey));
}
