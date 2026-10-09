import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { createPrivateClient } from "./private-query";
import { resolvePrivateDatabaseAccess } from "./private-db-access";
import { queryPrivate } from "./private-sql";

const PRIVATE_SCHEMAS = new Set(["catalogos", "catalog_v2", "gc_commerce"]);

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

function privateSchemaAccess(): "private" | "postgrest" {
  const access = resolvePrivateDatabaseAccess();
  if (access.kind === "refused") throw new Error(access.reason);
  if (access.kind === "direct" || access.kind === "staging-api") return "private";
  return "postgrest";
}

/** Client for server-side with optional service role (ingestion, publish). */
export function getSupabase(useServiceRole = false) {
  const client = getClient(useServiceRole);
  if (privateSchemaAccess() === "postgrest") return client;
  const originalSchema = client.schema.bind(client);
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === "schema") {
        return (schema: string) => {
          if (PRIVATE_SCHEMAS.has(schema)) return createPrivateClient(schema, queryPrivate);
          return originalSchema(schema as "public");
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as typeof client;
}

/**
 * Client that targets the catalogos schema via Supabase db.schema routing.
 * Use for all CatalogOS tables: suppliers, import_batches, url_import_jobs, supplier_products_raw, etc.
 * IDs are UUIDs (strings).
 */
export function getSupabaseCatalogos(useServiceRole = true): SupabaseClient {
  if (privateSchemaAccess() === "private") {
    return createPrivateClient("catalogos", queryPrivate) as unknown as SupabaseClient;
  }
  const key = useServiceRole && serviceKey ? serviceKey : anonKey;
  if (!url || !key) {
    throw new Error("Supabase URL and key must be set for CatalogOS");
  }
  return createClient(url, key, {
    auth: useServiceRole ? { persistSession: false, autoRefreshToken: false } : undefined,
    db: { schema: "catalogos" },
  }) as unknown as SupabaseClient;
}

export function isSupabaseConfigured() {
  return !!(url && (anonKey || serviceKey));
}
