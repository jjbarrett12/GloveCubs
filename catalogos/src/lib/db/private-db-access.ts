/**
 * Decides how CatalogOS may reach private schemas.
 * Production uses only SUPABASE_DB_URL. The staging SQL API cannot run there.
 */

export const STAGING_PROJECT_REF = "fmrupehxifzkpfphiyvm";
export const PRODUCTION_PROJECT_REFS = ["mnmagwsenzvetwngaszv", "kfrizyygvcjbomxdrdal"] as const;

export type CatalogosDataPlane = "production" | "staging" | "local" | "test";

export type PrivateDatabaseAccess =
  | { kind: "direct"; url: string }
  | { kind: "staging-api" }
  | { kind: "unconfigured" }
  | { kind: "refused"; reason: string };

const PRODUCTION_DB_REQUIRED =
  "CatalogOS production requires SUPABASE_DB_URL. Private schemas stay off PostgREST, and the staging SQL API cannot run in production.";

export function supabaseProjectRef(url: string): string | null {
  const trimmed = url.trim();
  const host = trimmed.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i);
  if (host?.[1]) return host[1].toLowerCase();
  const dbHost = trimmed.match(/db\.([a-z0-9]+)\.supabase\.co/i);
  if (dbHost?.[1]) return dbHost[1].toLowerCase();
  const user = trimmed.match(/postgres\.([a-z0-9]+)(?::|@)/i);
  if (user?.[1]) return user[1].toLowerCase();
  return null;
}

export function configuredSupabaseUrl(env: NodeJS.ProcessEnv): string {
  return String(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
}

export function catalogosDataPlane(env: NodeJS.ProcessEnv = process.env): CatalogosDataPlane {
  const nodeEnv = String(env.NODE_ENV || "").trim().toLowerCase();
  const vercelEnv = String(env.VERCEL_ENV || "").trim().toLowerCase();
  if (nodeEnv === "test") return "test";
  if (vercelEnv === "production") return "production";
  if (String(env.GC_ENVIRONMENT || "").trim().toLowerCase() === "staging" && vercelEnv !== "production") return "staging";
  if (nodeEnv === "production") return "production";
  if (supabaseProjectRef(configuredSupabaseUrl(env)) === STAGING_PROJECT_REF) return "staging";
  return "local";
}

export function directDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  if (catalogosDataPlane(env) === "production") {
    const url = String(env.SUPABASE_DB_URL || "").trim();
    return url || null;
  }
  const url = String(env.STAGING_DATABASE_URL || env.SUPABASE_DB_URL || "").trim();
  return url || null;
}

export function assertDatabaseUrlForPlane(url: string, env: NodeJS.ProcessEnv = process.env): void {
  if (!/^postgres(ql)?:\/\//i.test(url)) {
    throw new Error("Private database URL must be a postgres connection string.");
  }
  const plane = catalogosDataPlane(env);
  const dbRef = supabaseProjectRef(url);
  const appRef = supabaseProjectRef(configuredSupabaseUrl(env));
  const lower = url.toLowerCase();
  if (plane === "production") {
    if (!appRef || !dbRef || appRef !== dbRef) {
      throw new Error("SUPABASE_DB_URL must be the session or direct connection for the same Supabase project as this deployment.");
    }
    return;
  }
  for (const ref of PRODUCTION_PROJECT_REFS) {
    if (lower.includes(ref)) {
      throw new Error("Refusing a private database connection to a production project from a non-production runtime.");
    }
  }
  if (appRef && dbRef && appRef !== dbRef) {
    throw new Error("Private database URL must belong to the same Supabase project as SUPABASE_URL.");
  }
}

export function stagingSqlApiAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (catalogosDataPlane(env) === "production") return false;
  const explicit =
    String(env.GC_ENVIRONMENT || "").trim().toLowerCase() === "staging" || env.CATALOGOS_ALLOW_STAGING_SQL_API === "1";
  if (!explicit) return false;
  const token = String(env.STAGING_SQL_ACCESS_TOKEN || "");
  if (!token.startsWith("sbp")) return false;
  return supabaseProjectRef(configuredSupabaseUrl(env)) === STAGING_PROJECT_REF;
}

export function resolvePrivateDatabaseAccess(env: NodeJS.ProcessEnv = process.env): PrivateDatabaseAccess {
  const url = directDatabaseUrl(env);
  if (url) {
    try {
      assertDatabaseUrlForPlane(url, env);
    } catch (error) {
      return { kind: "refused", reason: error instanceof Error ? error.message : "Refusing private database URL." };
    }
    return { kind: "direct", url };
  }
  if (catalogosDataPlane(env) === "production") {
    return { kind: "refused", reason: PRODUCTION_DB_REQUIRED };
  }
  if (stagingSqlApiAllowed(env)) return { kind: "staging-api" };
  return { kind: "unconfigured" };
}

export function privateDbConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const access = resolvePrivateDatabaseAccess(env);
  if (access.kind === "refused") throw new Error(access.reason);
  return access.kind === "direct" || access.kind === "staging-api";
}

export function privateIntegrationConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    return privateDbConfigured(env);
  } catch {
    return false;
  }
}
