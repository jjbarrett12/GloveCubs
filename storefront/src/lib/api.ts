/**
 * Express `server.js` origin: cart, checkout, legacy customer JSON, webhooks, `/api/admin/*`.
 * Browser + server: set **`NEXT_PUBLIC_GLOVECUBS_API`** to this host only (e.g. `http://localhost:3004` or `https://api.glovecubs.com`).
 * This is **not** the marketing/storefront origin (`https://www.glovecubs.com`).
 *
 * @see ROUTE_OWNERSHIP.md — canonical host split (www vs api).
 */
export function getExpressCommerceApiOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_GLOVECUBS_API ?? "";
  return raw.trim().replace(/\/$/, "");
}

/**
 * Absolute URL for an Express path (must start with `/`). Empty env → relative path only (same document origin).
 * Prefer this over string-concatenating origins when calling Express from the storefront.
 */
export function buildExpressCommerceApiUrl(pathname: string): string {
  const base = getExpressCommerceApiOrigin();
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (!base) return path;
  return `${base}${path}`;
}

/** @deprecated Prefer {@link getExpressCommerceApiOrigin} for clarity. */
export function getApiBase(): string {
  return getExpressCommerceApiOrigin();
}
