/**
 * Emergency catalog cost containment.
 *
 * When `GC_EMERGENCY_DISABLE_CATALOG_SUPABASE=1`, customer-facing catalog readers must not
 * construct a Supabase admin client or issue PostgREST catalog queries.
 *
 * When `GC_EMERGENCY_DISABLE_PUBLIC_AI=1`, public AI / recommendation POST routes must
 * short-circuit (no OpenAI / catalog fan-out). Prefer Vercel WAF for durable rate limits —
 * there is no shared durable limiter configured in-repo.
 *
 * See `docs/EMERGENCY_CATALOG_KILL_SWITCH.md`.
 */

export function isCatalogSupabaseEmergencyDisabled(): boolean {
  return process.env.GC_EMERGENCY_DISABLE_CATALOG_SUPABASE === "1";
}

/** Emergency gate for anonymous AI / recommendation endpoints (exact string `"1"`). */
export function isPublicAiEmergencyDisabled(): boolean {
  return process.env.GC_EMERGENCY_DISABLE_PUBLIC_AI === "1";
}
