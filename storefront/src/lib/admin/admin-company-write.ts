/**
 * Admin company create/update helpers. gc_commerce.companies only — no public.users authority.
 */

import { B2B_TIER_CODES } from "@/lib/pricing/b2b-tier-meta";

export const COMPANY_STATUSES = ["active", "suspended", "archived"] as const;
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];

export type CompanyProfileInput = {
  trade_name: string;
  legal_name?: string | null;
  slug?: string | null;
  country_code?: string | null;
  status?: CompanyStatus;
  b2b_pricing_tier_code?: string;
};

export type CompanyRow = {
  id: string;
  trade_name: string;
  legal_name: string | null;
  slug: string;
  country_code: string | null;
  status: string;
  b2b_pricing_tier_code: string;
  created_at: string;
  updated_at: string;
};

const SLUG_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

export function slugifyCompanySlug(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  if (base.length >= 2 && SLUG_RE.test(base)) return base;
  const trimmed = base.replace(/-/g, "").slice(0, 62);
  const fallback = trimmed.length >= 2 ? trimmed : "co";
  return fallback.length >= 2 ? fallback : "co";
}

export function isValidCompanySlug(slug: string): boolean {
  return slug.length >= 2 && slug.length <= 64 && SLUG_RE.test(slug);
}

async function slugExists(supabase: any, slug: string): Promise<boolean> {
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("companies")
    .select("id")
    .ilike("slug", slug)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function ensureUniqueCompanySlug(supabase: any, baseSlug: string): Promise<string> {
  if (!(await slugExists(supabase, baseSlug))) return baseSlug;
  for (let n = 2; n <= 99; n++) {
    const suffix = `-${n}`;
    const candidate = `${baseSlug.slice(0, Math.max(2, 64 - suffix.length))}${suffix}`;
    if (isValidCompanySlug(candidate) && !(await slugExists(supabase, candidate))) {
      return candidate;
    }
  }
  throw new Error("slug_exhausted");
}

function normalizeCountry(code: string | null | undefined): string | null {
  const t = code?.trim().toUpperCase() ?? "";
  if (!t) return null;
  if (!/^[A-Z]{2}$/.test(t)) throw new Error("invalid_country_code");
  return t;
}

function normalizeTier(code: string | undefined): string {
  const c = (code ?? "cub").trim().toLowerCase();
  if (!(B2B_TIER_CODES as readonly string[]).includes(c)) throw new Error("invalid_tier");
  return c;
}

function normalizeStatus(status: string | undefined): CompanyStatus {
  const s = (status ?? "active").trim().toLowerCase();
  if (!(COMPANY_STATUSES as readonly string[]).includes(s)) throw new Error("invalid_status");
  return s as CompanyStatus;
}

export async function createCompany(supabase: any, input: CompanyProfileInput): Promise<CompanyRow> {
  const trade_name = input.trade_name.trim();
  if (!trade_name) throw new Error("trade_name_required");

  const baseSlug = input.slug?.trim() ? input.slug.trim().toLowerCase() : slugifyCompanySlug(trade_name);
  if (!isValidCompanySlug(baseSlug)) throw new Error("invalid_slug");

  const slug = await ensureUniqueCompanySlug(supabase, baseSlug);
  const now = new Date().toISOString();

  const row = {
    trade_name,
    legal_name: input.legal_name?.trim() || null,
    slug,
    country_code: normalizeCountry(input.country_code),
    status: normalizeStatus(input.status),
    b2b_pricing_tier_code: normalizeTier(input.b2b_pricing_tier_code),
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase.schema("gc_commerce").from("companies").insert(row).select().single();

  if (error) {
    if (error.code === "23505" || /duplicate|unique/i.test(error.message ?? "")) {
      throw new Error("slug_conflict");
    }
    throw error;
  }

  return data as CompanyRow;
}

export async function updateCompanyProfile(
  supabase: any,
  companyId: string,
  input: CompanyProfileInput
): Promise<CompanyRow> {
  const trade_name = input.trade_name.trim();
  if (!trade_name) throw new Error("trade_name_required");

  const slugRaw = input.slug?.trim().toLowerCase();
  if (!slugRaw || !isValidCompanySlug(slugRaw)) throw new Error("invalid_slug");

  const patch = {
    trade_name,
    legal_name: input.legal_name?.trim() || null,
    slug: slugRaw,
    country_code: normalizeCountry(input.country_code),
    status: normalizeStatus(input.status),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("companies")
    .update(patch)
    .eq("id", companyId)
    .select()
    .single();

  if (error) {
    if (error.code === "23505" || /duplicate|unique/i.test(error.message ?? "")) {
      throw new Error("slug_conflict");
    }
    throw error;
  }

  return data as CompanyRow;
}
