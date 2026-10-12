/**
 * Production env validation. Call from instrumentation or first API hit.
 * In production, missing required vars should fail fast.
 * SUPABASE_DB_URL is the server-only session or direct Postgres connection.
 * Private schemas stay off PostgREST; a missing URL must not fall back to them.
 */

import { catalogosDataPlane } from "./db/private-db-access";

const REQUIRED_IN_PROD = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_DB_URL",
] as const;

export function validateCriticalEnv(env: NodeJS.ProcessEnv = process.env): { ok: boolean; missing: string[] } {
  if (catalogosDataPlane(env) !== "production") {
    return { ok: true, missing: [] };
  }
  const missing = REQUIRED_IN_PROD.filter((key) => !env[key]?.trim());
  return { ok: missing.length === 0, missing: [...missing] };
}

export function assertCriticalEnv(): void {
  const { ok, missing } = validateCriticalEnv();
  if (!ok) {
    throw new Error(`[CatalogOS] Missing required env in production: ${missing.join(", ")}`);
  }
}
