/**
 * Maps Supabase Auth errors from `signInWithPassword` into user-facing copy.
 *
 * GoTrue intentionally uses one message for wrong email vs wrong password
 * ("Invalid login credentials") so callers cannot probe which accounts exist.
 */
export type SignInIssue = { title: string; lines: string[] };

export function signInIssueFromSupabaseAuthError(err: {
  message?: string | null;
  status?: number;
  code?: string | number | null;
}): SignInIssue {
  const raw = String(err.message ?? "").trim();
  const msg = raw || "Sign-in failed.";
  const lower = msg.toLowerCase();
  const code = String(err.code ?? "").trim().toLowerCase();

  if (err.status === 429 || lower.includes("too many requests") || lower.includes("rate limit")) {
    return {
      title: "Too many sign-in attempts",
      lines: ["Wait a few minutes, then try again.", msg],
    };
  }

  if (code === "user_banned" || lower.includes("banned") || lower.includes("user is banned")) {
    return {
      title: "This account is disabled",
      lines: ["This user cannot sign in. Contact support if you think this is a mistake."],
    };
  }

  if (
    lower.includes("email not confirmed") ||
    lower.includes("not confirmed") ||
    code === "email_not_confirmed"
  ) {
    return {
      title: "Email not confirmed",
      lines: [
        "This account exists, but the email address has not been confirmed yet.",
        "Check your inbox for a confirmation link, or ask an administrator to confirm your user in Supabase.",
      ],
    };
  }

  if (lower.includes("invalid api key")) {
    return {
      title: "Supabase configuration problem",
      lines: [
        "The app is using an API key Supabase rejected (often the anon key is wrong, for the wrong project, or has stray quotes in .env).",
        "Confirm NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY match your Supabase project (Settings → API), then restart the dev server so Next.js reloads env.",
      ],
    };
  }

  if (
    lower.includes("invalid login credentials") ||
    lower.includes("invalid email or password") ||
    lower.includes("invalid credentials") ||
    code === "invalid_credentials"
  ) {
    return {
      title: "Email or password did not match",
      lines: [
        "For security, we cannot tell you whether the email is unknown or only the password was wrong.",
        "Double-check the email address, watch for typos and extra spaces, and confirm Caps Lock is off for the password.",
        "If you are sure the email is correct, try resetting the password or contact support.",
      ],
    };
  }

  if (lower.includes("network") || lower.includes("fetch")) {
    return {
      title: "Network problem",
      lines: ["Check your connection and try again.", msg],
    };
  }

  return {
    title: "Sign-in failed",
    lines: [msg],
  };
}

/** True when the user asked to land in admin HTML routes after sign-in. */
export function requestedAdminRoute(safeNextPath: string): boolean {
  const p = (safeNextPath ?? "").trim().split("?")[0] ?? "";
  if (!p || p === "/") return false;
  const noTrail = p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
  return noTrail === "/admin" || noTrail.startsWith("/admin/");
}
