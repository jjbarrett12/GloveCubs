/**
 * Server-only self-signup provisioning: gc_commerce company + member.
 * No legacy public.users writes.
 */

import { createCompany } from "@/lib/admin/admin-company-write";
import { sanitizeSignupText, SELF_SIGNUP_DEFAULT_REDIRECT } from "@/lib/auth/self-signup-form";

const NAME_MAX = 80;
const COMPANY_MAX = 120;

export type FinalizeSelfSignupResult = {
  company_id: string;
  member_id: string;
  already_provisioned: boolean;
  redirect_path: typeof SELF_SIGNUP_DEFAULT_REDIRECT;
};

export function parseSelfSignupMetadata(
  raw: Record<string, unknown> | null | undefined,
): { companyName: string; displayName: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const companyName = sanitizeSignupText(String(raw.company_name ?? ""), COMPANY_MAX);
  const first = sanitizeSignupText(String(raw.first_name ?? ""), NAME_MAX);
  const last = sanitizeSignupText(String(raw.last_name ?? ""), NAME_MAX);
  if (!companyName) return null;
  const displayName = [first, last].filter(Boolean).join(" ").trim() || companyName;
  return { companyName, displayName };
}

async function fetchExistingMembership(
  supabase: any,
  userId: string,
): Promise<{ company_id: string; member_id: string } | null> {
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("company_members")
    .select("id, company_id")
    .eq("user_id", userId)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.company_id || !data?.id) return null;
  return { company_id: String(data.company_id), member_id: String(data.id) };
}

/**
 * Idempotent: if membership already exists, returns it. Otherwise creates active company + owner member.
 */
export async function finalizeSelfSignupForUser(
  supabase: any,
  userId: string,
  userMetadata: Record<string, unknown> | null | undefined,
): Promise<FinalizeSelfSignupResult> {
  const existing = await fetchExistingMembership(supabase, userId);
  if (existing) {
    return {
      company_id: existing.company_id,
      member_id: existing.member_id,
      already_provisioned: true,
      redirect_path: SELF_SIGNUP_DEFAULT_REDIRECT,
    };
  }

  const parsed = parseSelfSignupMetadata(userMetadata ?? undefined);
  if (!parsed) {
    throw new Error("missing_signup_metadata");
  }

  const company = await createCompany(supabase, {
    trade_name: parsed.companyName,
    status: "active",
    b2b_pricing_tier_code: "cub",
  });

  const now = new Date().toISOString();
  const { data: inserted, error: insertErr } = await supabase
    .schema("gc_commerce")
    .from("company_members")
    .insert({
      company_id: company.id,
      user_id: userId,
      role: "owner",
      invited_by_user_id: null,
      joined_at: now,
      created_at: now,
    })
    .select("id")
    .single();

  if (insertErr) {
    if (insertErr.code === "23505" || /duplicate|unique/i.test(insertErr.message ?? "")) {
      const raced = await fetchExistingMembership(supabase, userId);
      if (raced) {
        return {
          company_id: raced.company_id,
          member_id: raced.member_id,
          already_provisioned: true,
          redirect_path: SELF_SIGNUP_DEFAULT_REDIRECT,
        };
      }
    }
    throw insertErr;
  }

  return {
    company_id: company.id,
    member_id: String(inserted.id),
    already_provisioned: false,
    redirect_path: SELF_SIGNUP_DEFAULT_REDIRECT,
  };
}
