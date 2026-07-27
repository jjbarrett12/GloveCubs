/**
 * Emergency catalog cost containment.
 *
 * When `GC_EMERGENCY_DISABLE_CATALOG_SUPABASE=1`, customer-facing catalog readers must not
 * construct a Supabase admin client or issue PostgREST catalog queries.
 *
 * See `docs/EMERGENCY_CATALOG_KILL_SWITCH.md`.
 */

export function isCatalogSupabaseEmergencyDisabled(): boolean {
  return process.env.GC_EMERGENCY_DISABLE_CATALOG_SUPABASE === "1";
}
