/**
 * Safe Sentry capture for Storefront. No-op when Sentry is not configured.
 * Never throws; use from telemetry and API catch blocks.
 */

export function captureException(err: unknown, context?: Record<string, unknown>): void {
  try {
    if (typeof process === "undefined" || !process.env?.SENTRY_DSN) return;
    const Sentry = require("@sentry/nextjs");
    const payload = err instanceof Error ? err : new Error(String(err));
    if (context && typeof context === "object") {
      const safe: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(context)) {
        if (["password", "token", "secret", "authorization"].includes(k.toLowerCase())) continue;
        safe[k] = typeof v === "string" && v.length > 500 ? v.slice(0, 500) + "…" : v;
      }
      Sentry.setContext("glovecubs", safe);
    }
    Sentry.captureException(payload);
  } catch {
    // never throw
  }
}
