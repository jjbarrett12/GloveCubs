export type SupabasePublicEnvIssue = "ok" | "missing_public_env" | "blank_public_env";

/** Resolve Supabase URL/anon for browser auth (NEXT_PUBLIC_* with server fallbacks). */
export function resolveSupabasePublicEnv(): {
  url: string;
  anon: string;
  configured: boolean;
  issue: SupabasePublicEnvIssue;
} {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const rawAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const urlBlankInProcess =
    rawUrl !== undefined && (typeof rawUrl !== "string" || rawUrl.trim() === "");
  const anonBlankInProcess =
    rawAnon !== undefined && (typeof rawAnon !== "string" || rawAnon.trim() === "");

  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim() || "";
  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    "";
  const configured = Boolean(url && anon);
  const issue: SupabasePublicEnvIssue = configured
    ? "ok"
    : urlBlankInProcess || anonBlankInProcess
      ? "blank_public_env"
      : "missing_public_env";

  return { url, anon, configured, issue };
}
