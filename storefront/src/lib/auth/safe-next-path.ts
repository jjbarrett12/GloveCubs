/**
 * Prevents open redirects after sign-in: only same-origin relative paths allowed.
 */
export function safeCommerceNextPath(raw: string | string[] | undefined | null): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== "string") return "/account";
  const t = v.trim();
  if (!t.startsWith("/") || t.startsWith("//")) return "/account";
  if (t.includes("://") || t.includes("\\")) return "/account";
  return t;
}
