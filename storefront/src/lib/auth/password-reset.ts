import { safeCommerceNextPath } from "@/lib/auth/safe-next-path";
import { resolveStorefrontPublicOrigin } from "@/lib/auth/storefront-origin";

export const PASSWORD_RESET_NEXT_PATH = "/login/reset";

export function buildPasswordRecoveryRedirectUrl(runtimeOrigin?: string | null): string | null {
  const origin = resolveStorefrontPublicOrigin(runtimeOrigin);
  if (!origin) return null;
  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("next", PASSWORD_RESET_NEXT_PATH);
  return callback.toString();
}

export type PasswordResetRequestOutcome =
  | { kind: "sent" }
  | { kind: "redirect_error" }
  | { kind: "rate_limited"; message: string }
  | { kind: "generic_error"; message: string };

/** Map Supabase reset errors to UI outcomes without revealing account existence. */
export function classifyPasswordResetRequestResult(
  error: { message?: string | null; status?: number } | null,
): PasswordResetRequestOutcome {
  if (!error) return { kind: "sent" };
  const lower = String(error.message ?? "").toLowerCase();
  if (error.status === 429 || lower.includes("rate limit") || lower.includes("too many")) {
    return {
      kind: "rate_limited",
      message: "Too many reset requests. Wait a few minutes, then try again.",
    };
  }
  if (lower.includes("invalid api key")) {
    return {
      kind: "generic_error",
      message: "Password reset is unavailable due to a deployment configuration problem.",
    };
  }
  return { kind: "sent" };
}

/** Restrict post-recovery callback destinations — no admin open redirects from email links. */
export function safeAuthCallbackNextPath(raw: string | null | undefined): string {
  const next = safeCommerceNextPath(raw ?? PASSWORD_RESET_NEXT_PATH);
  if (next.startsWith("/admin")) return PASSWORD_RESET_NEXT_PATH;
  if (next.startsWith("/login/reset") || next === "/login") return next;
  if (next.startsWith("/signup/complete")) return next;
  if (next.startsWith("/account") || next.startsWith("/workspace")) return next;
  return PASSWORD_RESET_NEXT_PATH;
}

export function classifyPasswordUpdateError(err: {
  message?: string | null;
  status?: number;
}): { title: string; lines: string[]; expired: boolean } {
  const lower = String(err.message ?? "").toLowerCase();
  if (
    lower.includes("session") ||
    lower.includes("jwt") ||
    lower.includes("expired") ||
    lower.includes("invalid") ||
    lower.includes("same_password")
  ) {
    return {
      title: "Reset link expired or invalid",
      lines: ["Request a new password reset from the login page, then open the newest email link."],
      expired: true,
    };
  }
  if (err.status === 422 || lower.includes("password")) {
    return {
      title: "Password could not be updated",
      lines: ["Choose a stronger password and try again."],
      expired: false,
    };
  }
  return {
    title: "Password update failed",
    lines: ["Try again in a moment. If the problem continues, request a new reset link."],
    expired: false,
  };
}

/** Strip values that must never appear in logs or test output. */
export function sanitizeAuthDiagnosticMessage(raw: string): string {
  return raw
    .replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, "[redacted-token]")
    .replace(/access_token=[^&\s]+/gi, "access_token=[redacted]")
    .replace(/refresh_token=[^&\s]+/gi, "refresh_token=[redacted]")
    .replace(/password[=:]\S+/gi, "password=[redacted]");
}
