/**
 * Admin buyer onboarding: link or create Supabase auth users in gc_commerce.company_members.
 * Canonical tenant model only — no public.users writes.
 */

import { randomBytes } from "node:crypto";

export const COMPANY_MEMBER_ROLES = ["owner", "admin", "member", "viewer", "billing"] as const;
export type CompanyMemberRole = (typeof COMPANY_MEMBER_ROLES)[number];

export type AddCompanyMemberInput = {
  email: string;
  role?: string;
  display_name?: string | null;
};

export type CompanyMemberWriteRow = {
  id: string;
  user_id: string;
  role: string;
  joined_at: string;
  email: string;
};

export type AddCompanyMemberOutcome = "already_member" | "linked_existing_user" | "created_user";

export type AddCompanyMemberResult = {
  outcome: AddCompanyMemberOutcome;
  member: CompanyMemberWriteRow;
  auth_user_created: boolean;
  password_setup_required: boolean;
  quotes_linked_count?: number;
  quotes_link_warning?: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeBuyerEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) throw new Error("invalid_email");
  return email;
}

export function normalizeMemberRole(raw: string | undefined): CompanyMemberRole {
  const role = (raw ?? "member").trim().toLowerCase();
  if (!(COMPANY_MEMBER_ROLES as readonly string[]).includes(role)) throw new Error("invalid_role");
  return role as CompanyMemberRole;
}

async function findAuthUserByEmail(supabase: any, email: string) {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const users = data?.users ?? [];
    const found = users.find((u: { email?: string | null }) => (u.email ?? "").trim().toLowerCase() === email);
    if (found) return found;
    if (users.length < 1000) break;
  }
  return null;
}

async function ensureAuthUserForBuyer(
  supabase: any,
  email: string,
  displayName: string | null | undefined,
): Promise<{ userId: string; created: boolean; passwordSetupRequired: boolean }> {
  const existing = await findAuthUserByEmail(supabase, email);
  if (existing?.id) {
    return { userId: String(existing.id), created: false, passwordSetupRequired: false };
  }

  const metadata =
    displayName?.trim() ?
      { display_name: displayName.trim() }
    : undefined;

  let { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    ...(metadata ? { user_metadata: metadata } : {}),
  });

  if (error && /password/i.test(error.message ?? "")) {
    const tempPassword = randomBytes(32).toString("base64url");
    ({ data, error } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      ...(metadata ? { user_metadata: metadata } : {}),
    }));
  }

  if (error) {
    throw error;
  }

  const userId = data?.user?.id;
  if (!userId) throw new Error("auth_user_create_failed");

  return { userId: String(userId), created: true, passwordSetupRequired: true };
}

async function fetchCompanyMemberRow(
  supabase: any,
  companyId: string,
  userId: string,
  email: string,
): Promise<CompanyMemberWriteRow | null> {
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("company_members")
    .select("id, user_id, role, joined_at")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: String(data.id),
    user_id: String(data.user_id),
    role: String(data.role),
    joined_at: String(data.joined_at),
    email,
  };
}

export type LinkOrphanQuotesResult = {
  linked_count: number;
  linked_ids: string[];
};

/**
 * Backfill catalogos.quote_requests.gc_company_id for exact normalized email matches.
 * Uses SECURITY DEFINER RPC: lower(trim(email)) equality — never ILIKE (no _/% wildcards).
 * Idempotent — only updates rows that are still unlinked (gc_company_id IS NULL).
 * When userId is provided, RPC requires membership in companyId.
 */
export async function linkOrphanQuoteRequestsByEmail(
  supabase: any,
  opts: { email: string; companyId: string; userId?: string | null },
): Promise<LinkOrphanQuotesResult> {
  const email = normalizeBuyerEmail(opts.email);
  const { data, error } = await supabase.schema("catalogos").rpc(
    "gc_link_orphan_quote_requests_by_email",
    {
      p_email: email,
      p_company_id: opts.companyId,
      p_user_id: opts.userId ?? null,
    },
  );

  if (error) throw error;

  const linkedCount = Number((data as { linked_count?: number } | null)?.linked_count ?? 0);
  const rawIds = (data as { linked_ids?: unknown } | null)?.linked_ids;
  const linkedIds = Array.isArray(rawIds) ? rawIds.map((id) => String(id)) : [];

  return { linked_count: linkedCount, linked_ids: linkedIds };
}

/** Attempt linkage; never throws — returns observable warning for callers. */
export async function tryLinkOrphanQuoteRequestsByEmail(
  supabase: any,
  opts: { email: string; companyId: string; userId?: string | null },
): Promise<LinkOrphanQuotesResult & { warning: string | null }> {
  try {
    const result = await linkOrphanQuoteRequestsByEmail(supabase, opts);
    return { ...result, warning: null };
  } catch (err) {
    console.error("[tryLinkOrphanQuoteRequestsByEmail] quote linkage failed", {
      companyId: opts.companyId,
      userId: opts.userId ?? null,
      err,
    });
    return { linked_count: 0, linked_ids: [], warning: "quote_link_failed" };
  }
}

export async function addCompanyMemberForAdmin(
  supabase: any,
  companyId: string,
  input: AddCompanyMemberInput,
  invitedByUserId: string | null,
): Promise<AddCompanyMemberResult> {
  const email = normalizeBuyerEmail(input.email);
  const role = normalizeMemberRole(input.role);

  const { data: company, error: companyErr } = await supabase
    .schema("gc_commerce")
    .from("companies")
    .select("id")
    .eq("id", companyId)
    .maybeSingle();

  if (companyErr) throw companyErr;
  if (!company) {
    const err = new Error("company_not_found");
    throw err;
  }

  const { userId, created, passwordSetupRequired } = await ensureAuthUserForBuyer(
    supabase,
    email,
    input.display_name,
  );

  const existingMember = await fetchCompanyMemberRow(supabase, companyId, userId, email);
  if (existingMember) {
    return {
      outcome: "already_member",
      member: existingMember,
      auth_user_created: false,
      password_setup_required: false,
    };
  }

  const now = new Date().toISOString();
  const { data: inserted, error: insertErr } = await supabase
    .schema("gc_commerce")
    .from("company_members")
    .insert({
      company_id: companyId,
      user_id: userId,
      role,
      invited_by_user_id: invitedByUserId,
      joined_at: now,
      created_at: now,
    })
    .select("id, user_id, role, joined_at")
    .single();

  if (insertErr) {
    if (insertErr.code === "23505" || /duplicate|unique/i.test(insertErr.message ?? "")) {
      const member = await fetchCompanyMemberRow(supabase, companyId, userId, email);
      if (member) {
        return {
          outcome: "already_member",
          member,
          auth_user_created: false,
          password_setup_required: false,
        };
      }
    }
    throw insertErr;
  }

  const link = await tryLinkOrphanQuoteRequestsByEmail(supabase, {
    email,
    companyId,
    userId,
  });

  return {
    outcome: created ? "created_user" : "linked_existing_user",
    member: {
      id: String(inserted.id),
      user_id: String(inserted.user_id),
      role: String(inserted.role),
      joined_at: String(inserted.joined_at),
      email,
    },
    auth_user_created: created,
    password_setup_required: passwordSetupRequired,
    quotes_linked_count: link.linked_count,
    quotes_link_warning: link.warning,
  };
}
