/** Resolve Supabase URL/anon for browser auth (NEXT_PUBLIC_* with server fallbacks). */
export function resolveSupabasePublicEnv(): { url: string; anon: string; configured: boolean } {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim() || "";
  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    "";
  return { url, anon, configured: Boolean(url && anon) };
}
