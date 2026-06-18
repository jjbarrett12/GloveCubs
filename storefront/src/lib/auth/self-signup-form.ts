/**
 * Client-safe self-signup form helpers (no server-only imports).
 */

import { validateNewPasswordPair } from "@/lib/auth/password-validation";
import { resolveStorefrontPublicOrigin } from "@/lib/auth/storefront-origin";

export const SELF_SIGNUP_COMPLETE_PATH = "/signup/complete";
export const SELF_SIGNUP_DEFAULT_REDIRECT = "/account";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_MAX = 80;
const COMPANY_MAX = 120;
const PHONE_MAX = 32;
const WEBSITE_MAX = 200;

export type SelfSignupFormInput = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  companyName: string;
  phone?: string;
  website?: string;
};

export type SelfSignupUserMetadata = {
  first_name: string;
  last_name: string;
  company_name: string;
  phone?: string;
  website?: string;
  onboarding_source: "self_signup";
};

export function sanitizeSignupText(raw: string, maxLen: number): string {
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLen);
}

function sanitizeOptionalSignupText(raw: string | undefined, maxLen: number): string | undefined {
  if (raw == null) return undefined;
  const t = sanitizeSignupText(raw, maxLen);
  return t || undefined;
}

function normalizeSignupEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) throw new Error("invalid_email");
  return email;
}

export function validateSelfSignupForm(
  input: SelfSignupFormInput,
): { ok: true; normalized: SelfSignupFormInput & { email: string } } | { ok: false; message: string } {
  const firstName = sanitizeSignupText(input.firstName, NAME_MAX);
  const lastName = sanitizeSignupText(input.lastName, NAME_MAX);
  const companyName = sanitizeSignupText(input.companyName, COMPANY_MAX);
  const phone = sanitizeOptionalSignupText(input.phone, PHONE_MAX);
  const website = sanitizeOptionalSignupText(input.website, WEBSITE_MAX);

  if (!firstName) return { ok: false, message: "Enter your first name." };
  if (!lastName) return { ok: false, message: "Enter your last name." };
  if (!companyName) return { ok: false, message: "Enter your company name." };

  let email: string;
  try {
    email = normalizeSignupEmail(input.email);
  } catch {
    return { ok: false, message: "Enter a valid email address." };
  }

  const passwordCheck = validateNewPasswordPair(input.password, input.confirmPassword);
  if (!passwordCheck.ok) {
    return { ok: false, message: passwordCheck.message };
  }

  return {
    ok: true,
    normalized: {
      firstName,
      lastName,
      email,
      password: input.password,
      confirmPassword: input.confirmPassword,
      companyName,
      phone,
      website,
    },
  };
}

export function buildSelfSignupUserMetadata(
  input: Pick<SelfSignupFormInput, "firstName" | "lastName" | "companyName" | "phone" | "website">,
): SelfSignupUserMetadata {
  const meta: SelfSignupUserMetadata = {
    first_name: sanitizeSignupText(input.firstName, NAME_MAX),
    last_name: sanitizeSignupText(input.lastName, NAME_MAX),
    company_name: sanitizeSignupText(input.companyName, COMPANY_MAX),
    onboarding_source: "self_signup",
  };
  const phone = sanitizeOptionalSignupText(input.phone, PHONE_MAX);
  const website = sanitizeOptionalSignupText(input.website, WEBSITE_MAX);
  if (phone) meta.phone = phone;
  if (website) meta.website = website;
  return meta;
}

export function buildSelfSignupConfirmRedirectUrl(runtimeOrigin?: string | null): string | null {
  const origin = resolveStorefrontPublicOrigin(runtimeOrigin);
  if (!origin) return null;
  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("next", SELF_SIGNUP_COMPLETE_PATH);
  return callback.toString();
}
