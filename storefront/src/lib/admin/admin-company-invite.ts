/**
 * Admin company invitation system.
 * Generates time-limited invite tokens for buyer onboarding.
 */

import { createHash, randomBytes } from "node:crypto";
import { normalizeBuyerEmail, normalizeMemberRole } from "./admin-company-member-write";

const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type CreateInviteInput = {
  companyId: string;
  email: string;
  role?: string;
  invitedByUserId: string | null;
};

export type CreateInviteResult = {
  id: string;
  rawToken: string;
  expiresAt: string;
};

export type InvitationRow = {
  id: string;
  company_id: string;
  email: string;
  role: string;
  expires_at: string;
  revoked_at: string | null;
  accepted_at: string | null;
  created_at: string;
};

export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createCompanyInvite(
  supabase: any,
  input: CreateInviteInput,
): Promise<CreateInviteResult> {
  const email = normalizeBuyerEmail(input.email);
  const role = normalizeMemberRole(input.role);

  const { data: company, error: companyErr } = await supabase
    .schema("gc_commerce")
    .from("companies")
    .select("id")
    .eq("id", input.companyId)
    .maybeSingle();

  if (companyErr) throw companyErr;
  if (!company) throw new Error("company_not_found");

  // Check for existing active invite
  const { data: existing } = await supabase
    .schema("gc_commerce")
    .from("company_invitations")
    .select("id")
    .eq("company_id", input.companyId)
    .ilike("email", email)
    .is("revoked_at", null)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (existing) {
    throw new Error("active_invite_exists");
  }

  // Check if already a member
  const { data: members } = await supabase
    .schema("gc_commerce")
    .from("company_members")
    .select("id, user_id")
    .eq("company_id", input.companyId);

  if (members && members.length > 0) {
    // Need to check if any member has this email
    for (const m of members) {
      const { data: authUsers } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const user = authUsers?.users?.find(
        (u: { id: string; email?: string }) =>
          u.id === m.user_id && u.email?.toLowerCase() === email,
      );
      if (user) throw new Error("already_member");
    }
  }

  const rawToken = generateInviteToken();
  const tokenHash = hashInviteToken(rawToken);
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_MS).toISOString();

  const { data: invite, error: insertErr } = await supabase
    .schema("gc_commerce")
    .from("company_invitations")
    .insert({
      company_id: input.companyId,
      email,
      role,
      token_hash: tokenHash,
      expires_at: expiresAt,
      invited_by_user_id: input.invitedByUserId,
    })
    .select("id, expires_at")
    .single();

  if (insertErr) {
    if (insertErr.code === "23505" || /duplicate|unique/i.test(insertErr.message ?? "")) {
      throw new Error("active_invite_exists");
    }
    throw insertErr;
  }

  return {
    id: String(invite.id),
    rawToken,
    expiresAt: String(invite.expires_at),
  };
}

export async function revokeCompanyInvite(
  supabase: any,
  inviteId: string,
): Promise<{ revoked: boolean }> {
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("company_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", inviteId)
    .is("revoked_at", null)
    .is("accepted_at", null)
    .select("id");

  if (error) throw error;
  return { revoked: Array.isArray(data) && data.length > 0 };
}

export async function listCompanyInvites(
  supabase: any,
  companyId: string,
): Promise<InvitationRow[]> {
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("company_invitations")
    .select("id, company_id, email, role, expires_at, revoked_at, accepted_at, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  return data ?? [];
}

export type ValidateInviteResult =
  | { valid: true; invite: InvitationRow & { company_trade_name: string } }
  | { valid: false; reason: "not_found" | "expired" | "revoked" | "accepted" };

export async function validateInviteToken(
  supabase: any,
  token: string,
): Promise<ValidateInviteResult> {
  const tokenHash = hashInviteToken(token);

  const { data: invite, error } = await supabase
    .schema("gc_commerce")
    .from("company_invitations")
    .select("id, company_id, email, role, expires_at, revoked_at, accepted_at, created_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) throw error;
  if (!invite) return { valid: false, reason: "not_found" };

  if (invite.accepted_at) return { valid: false, reason: "accepted" };
  if (invite.revoked_at) return { valid: false, reason: "revoked" };
  if (new Date(invite.expires_at) < new Date()) return { valid: false, reason: "expired" };

  // Fetch company name
  const { data: company } = await supabase
    .schema("gc_commerce")
    .from("companies")
    .select("trade_name")
    .eq("id", invite.company_id)
    .maybeSingle();

  return {
    valid: true,
    invite: {
      ...invite,
      company_trade_name: company?.trade_name ?? "Unknown Company",
    },
  };
}

export async function acceptCompanyInvite(
  supabase: any,
  token: string,
  acceptingUserId: string,
): Promise<{ member_id: string; company_id: string }> {
  const validation = await validateInviteToken(supabase, token);
  if (!validation.valid) {
    throw new Error(`invite_${validation.reason}`);
  }

  const { invite } = validation;
  const tokenHash = hashInviteToken(token);

  // Check if user email matches invite email
  const { data: authData, error: authErr } = await supabase.auth.admin.getUserById(acceptingUserId);
  if (authErr) throw authErr;
  
  const userEmail = authData?.user?.email?.toLowerCase();
  if (!userEmail || userEmail !== invite.email.toLowerCase()) {
    throw new Error("email_mismatch");
  }

  // Check if already a member
  const { data: existingMember } = await supabase
    .schema("gc_commerce")
    .from("company_members")
    .select("id")
    .eq("company_id", invite.company_id)
    .eq("user_id", acceptingUserId)
    .maybeSingle();

  if (existingMember) {
    // Already a member, just mark invite as accepted (idempotent)
    await supabase
      .schema("gc_commerce")
      .from("company_invitations")
      .update({ accepted_at: new Date().toISOString(), accepted_user_id: acceptingUserId })
      .eq("token_hash", tokenHash);
    
    return { member_id: existingMember.id, company_id: invite.company_id };
  }

  // Create membership
  const now = new Date().toISOString();
  const { data: member, error: memberErr } = await supabase
    .schema("gc_commerce")
    .from("company_members")
    .insert({
      company_id: invite.company_id,
      user_id: acceptingUserId,
      role: invite.role,
      invited_by_user_id: null,
      joined_at: now,
      created_at: now,
    })
    .select("id")
    .single();

  if (memberErr) throw memberErr;

  // Mark invite as accepted
  await supabase
    .schema("gc_commerce")
    .from("company_invitations")
    .update({ accepted_at: now, accepted_user_id: acceptingUserId })
    .eq("token_hash", tokenHash);

  return { member_id: member.id, company_id: invite.company_id };
}
