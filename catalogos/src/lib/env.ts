/**
 * Production env validation. Call from instrumentation or first API hit.
 * In production, missing required vars should fail fast.
 */

const REQUIRED_IN_PROD = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

export function validateCriticalEnv(): { ok: boolean; missing: string[] } {
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv !== "production") {
    return { ok: true, missing: [] };
  }
  const missing = REQUIRED_IN_PROD.filter((key) => !process.env[key]?.trim());
  return { ok: missing.length === 0, missing: [...missing] };
}

export function assertCriticalEnv(): void {
  const { ok, missing } = validateCriticalEnv();
  if (!ok) {
    throw new Error(`[CatalogOS] Missing required env in production: ${missing.join(", ")}`);
  }
}
