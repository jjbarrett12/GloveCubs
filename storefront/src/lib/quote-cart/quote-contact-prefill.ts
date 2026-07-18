/**
 * Client-safe quote cart contact prefill builder (no server-only imports).
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_MAX = 160;
const COMPANY_MAX = 300;
const PHONE_MAX = 40;

export type QuoteContactPrefill = {
  name?: string;
  email: string;
  company?: string;
  phone?: string;
};

export type QuoteContactPrefillInput = {
  email: string | null | undefined;
  userMetadata: Record<string, unknown> | null | undefined;
  companyTradeName: string | null | undefined;
};

function sanitizeText(raw: unknown, maxLen: number): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLen);
}

function buildDisplayName(metadata: Record<string, unknown>): string {
  const first = sanitizeText(metadata.first_name, 80);
  const last = sanitizeText(metadata.last_name, 80);
  return [first, last].filter(Boolean).join(" ").trim().slice(0, NAME_MAX);
}

/**
 * Builds quote cart contact prefill from authenticated user + canonical company row.
 * Returns null when email is missing/invalid (anonymous or incomplete auth).
 */
export function buildQuoteContactPrefill(input: QuoteContactPrefillInput): QuoteContactPrefill | null {
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (!email || !EMAIL_RE.test(email) || email.length > 254) return null;

  const meta = input.userMetadata && typeof input.userMetadata === "object" ? input.userMetadata : {};
  const name = buildDisplayName(meta);
  const company = sanitizeText(input.companyTradeName, COMPANY_MAX);
  const phone = sanitizeText(meta.phone, PHONE_MAX);

  const prefill: QuoteContactPrefill = { email };
  if (name) prefill.name = name;
  if (company) prefill.company = company;
  if (phone) prefill.phone = phone;
  return prefill;
}

export function applyQuoteContactPrefillToFields(
  current: { name: string; email: string; company: string; phone: string },
  prefill: QuoteContactPrefill,
): { next: typeof current; changed: boolean } {
  const next = { ...current };
  let changed = false;

  if (!next.name.trim() && prefill.name?.trim()) {
    next.name = prefill.name.trim();
    changed = true;
  }
  if (!next.email.trim() && prefill.email.trim()) {
    next.email = prefill.email.trim();
    changed = true;
  }
  if (!next.company.trim() && prefill.company?.trim()) {
    next.company = prefill.company.trim();
    changed = true;
  }
  if (!next.phone.trim() && prefill.phone?.trim()) {
    next.phone = prefill.phone.trim();
    changed = true;
  }

  return { next, changed };
}
