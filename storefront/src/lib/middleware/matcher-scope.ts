/**
 * Explicit middleware path scope for emergency cost containment.
 * Session refresh runs only on authenticated surfaces + internal API gate.
 * Authorization remains in layouts / route handlers (never middleware-only).
 */

const EXACT = new Set([
  "/account",
  "/workspace",
  "/admin",
  "/api/account",
  "/api/auth",
  "/api/customer",
  "/api/workspace",
  "/api/internal",
]);

const PREFIXES = [
  "/account/",
  "/workspace/",
  "/admin/",
  "/api/account/",
  "/api/auth/",
  "/api/customer/",
  "/api/workspace/",
  "/api/internal/",
] as const;

/** True when Next middleware should run for this pathname. */
export function middlewareShouldRun(pathname: string): boolean {
  if (!pathname || pathname === "/") return false;
  if (EXACT.has(pathname)) return true;
  return PREFIXES.some((p) => pathname.startsWith(p));
}

/**
 * Next.js `config.matcher` entries — keep in sync with {@link middlewareShouldRun}.
 * Explicit prefixes only (no near-global negative lookahead).
 */
export const MIDDLEWARE_MATCHER = [
  "/account",
  "/account/:path*",
  "/workspace",
  "/workspace/:path*",
  "/admin",
  "/admin/:path*",
  "/api/account",
  "/api/account/:path*",
  "/api/auth",
  "/api/auth/:path*",
  "/api/customer",
  "/api/customer/:path*",
  "/api/workspace",
  "/api/workspace/:path*",
  "/api/internal",
  "/api/internal/:path*",
] as const;
