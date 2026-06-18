/** Normalize a configured or runtime origin for auth redirect URLs. */
export function normalizeStorefrontOrigin(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const u = new URL(withProto);
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) return null;
    return u.origin;
  } catch {
    return null;
  }
}

/** Resolve the public storefront origin for Supabase email redirect URLs. */
export function resolveStorefrontPublicOrigin(runtimeOrigin?: string | null): string | null {
  const candidates = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_STOREFRONT_PUBLIC_ORIGIN,
    process.env.STOREFRONT_PUBLIC_ORIGIN,
    runtimeOrigin,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const origin = normalizeStorefrontOrigin(candidate);
    if (origin) return origin;
  }
  return null;
}
