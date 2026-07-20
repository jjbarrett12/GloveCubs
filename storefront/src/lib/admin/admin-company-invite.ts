/**
 * Admin company invitation system.
 * Generates time-limited invite tokens for buyer onboarding.
 *
 * Resend contract: if a still-valid pending invite exists for company+email,
 * reissue by rotating token_hash + expires_at (same row). Expired pending rows
 * are marked status=expired before insert/reissue.
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
  reissued: boolean;
};

export type InvitationRow = {
  id: string;
  company_id: string;
  email: string;
  email_normalized?: string;
  role: string;
  status?: string;
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

/** Mark pending invites past expires_at as expired (stable uniqueness set). */
export async function expireStalePendingInvites(
  supabase: any,
  companyId: string,
  emailNormalized: string,
): Promise<number> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("company_invitations")
    .update({ status: "expired" })
    .eq("company_id", companyId)
    .eq("email_normalized", emailNormalized)
    .eq("status", "pending")
    .lte("expires_at", nowIso)
    .select("id");

  if (error) throw error;
  return Array.isArray(data) ? data.length : 0;
}

async function assertNotAlreadyMember(
  supabase: any,
  companyId: string,
  email: string,
): Promise<void> {
  const { data: members } = await supabase
    .schema("gc_commerce")
    .from("company_members")
    .select("id, user_id")
    .eq("company_id", companyId);

  if (!members || members.length === 0) return;

  for (const m of members) {
    const { data: authData, error: authErr } = await supabase.auth.admin.getUserById(m.user_id);
    if (authErr) continue;
    const memberEmail = authData?.user?.email?.toLowerCase();
    if (memberEmail && memberEmail === email) {
      throw new Error("already_member");
    }
  }
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

  await expireStalePendingInvites(supabase, input.companyId, email);
  await assertNotAlreadyMember(supabase, input.companyId, email);

  const { data: existingPending } = await supabase
    .schema("gc_commerce")
    .from("company_invitations")
    .select("id, expires_at")
    .eq("company_id", input.companyId)
    .eq("email_normalized", email)
    .eq("status", "pending")
    .maybeSingle();

  const rawToken = generateInviteToken();
  const tokenHash = hashInviteToken(rawToken);
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_MS).toISOString();

  // Resend contract: reissue still-valid pending invite (rotate token + expiry).
  if (existingPending?.id) {
    const { data: updated, error: updateErr } = await supabase
      .schema("gc_commerce")
      .from("company_invitations")
      .update({
        token_hash: tokenHash,
        expires_at: expiresAt,
        role,
        invited_by_user_id: input.invitedByUserId,
      })
      .eq("id", existingPending.id)
      .eq("status", "pending")
      .select("id, expires_at")
      .single();

    if (updateErr) throw updateErr;
    return {
      id: String(updated.id),
      rawToken,
      expiresAt: String(updated.expires_at),
      reissued: true,
    };
  }

  const { data: invite, error: insertErr } = await supabase
    .schema("gc_commerce")
    .from("company_invitations")
    .insert({
      company_id: input.companyId,
      email,
      email_normalized: email,
      role,
      status: "pending",
      token_hash: tokenHash,
      expires_at: expiresAt,
      invited_by_user_id: input.invitedByUserId,
    })
    .select("id, expires_at")
    .single();

  if (insertErr) {
    // Concurrent create: unique pending (company, email) — re-fetch and reissue.
    if (insertErr.code === "23505" || /duplicate|unique/i.test(insertErr.message ?? "")) {
      const { data: raced } = await supabase
        .schema("gc_commerce")
        .from("company_invitations")
        .select("id")
        .eq("company_id", input.companyId)
        .eq("email_normalized", email)
        .eq("status", "pending")
        .maybeSingle();

      if (raced?.id) {
        const { data: updated, error: updateErr } = await supabase
          .schema("gc_commerce")
          .from("company_invitations")
          .update({
            token_hash: tokenHash,
            expires_at: expiresAt,
            role,
            invited_by_user_id: input.invitedByUserId,
          })
          .eq("id", raced.id)
          .eq("status", "pending")
          .select("id, expires_at")
          .single();
        if (updateErr) throw updateErr;
        return {
          id: String(updated.id),
          rawToken,
          expiresAt: String(updated.expires_at),
          reissued: true,
        };
      }
      throw new Error("active_invite_exists");
    }
    throw insertErr;
  }

  return {
    id: String(invite.id),
    rawToken,
    expiresAt: String(invite.expires_at),
    reissued: false,
  };
}

export async function revokeCompanyInvite(
  supabase: any,
  inviteId: string,
  companyId: string,
): Promise<{ revoked: boolean }> {
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("company_invitations")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
    })
    .eq("id", inviteId)
    .eq("company_id", companyId)
    .eq("status", "pending")
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
    .select(
      "id, company_id, email, email_normalized, role, status, expires_at, revoked_at, accepted_at, created_at",
    )
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
    .select(
      "id, company_id, email, email_normalized, role, status, expires_at, revoked_at, accepted_at, created_at",
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) throw error;
  if (!invite) return { valid: false, reason: "not_found" };

  const status = String(invite.status ?? "");
  if (status === "accepted" || invite.accepted_at) return { valid: false, reason: "accepted" };
  if (status === "revoked" || invite.revoked_at) return { valid: false, reason: "revoked" };

  if (status === "expired" || new Date(invite.expires_at) < new Date()) {
    if (status === "pending") {
      await supabase
        .schema("gc_commerce")
        .from("company_invitations")
        .update({ status: "expired" })
        .eq("id", invite.id)
        .eq("status", "pending");
    }
    return { valid: false, reason: "expired" };
  }

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

  const { data: authData, error: authErr } = await supabase.auth.admin.getUserById(acceptingUserId);
  if (authErr) throw authErr;

  const userEmail = authData?.user?.email?.toLowerCase();
  const inviteEmail = (invite.email_normalized || invite.email).toLowerCase();
  if (!userEmail || userEmail !== inviteEmail) {
    throw new Error("email_mismatch");
  }

  const { data: existingMember } = await supabase
    .schema("gc_commerce")
    .from("company_members")
    .select("id")
    .eq("company_id", invite.company_id)
    .eq("user_id", acceptingUserId)
    .maybeSingle();

  const now = new Date().toISOString();

  if (existingMember) {
    await supabase
      .schema("gc_commerce")
      .from("company_invitations")
      .update({
        status: "accepted",
        accepted_at: now,
        accepted_user_id: acceptingUserId,
      })
      .eq("token_hash", tokenHash)
      .eq("status", "pending");

    return { member_id: existingMember.id, company_id: invite.company_id };
  }

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

  if (memberErr) {
    const code = String((memberErr as { code?: string }).code ?? "");
    if (code === "23505") {
      const { data: raced } = await supabase
        .schema("gc_commerce")
        .from("company_members")
        .select("id")
        .eq("company_id", invite.company_id)
        .eq("user_id", acceptingUserId)
        .maybeSingle();
      if (raced?.id) {
        await supabase
          .schema("gc_commerce")
          .from("company_invitations")
          .update({
            status: "accepted",
            accepted_at: now,
            accepted_user_id: acceptingUserId,
          })
          .eq("token_hash", tokenHash)
          .eq("status", "pending");
        return { member_id: raced.id, company_id: invite.company_id };
      }
    }
    throw memberErr;
  }

  await supabase
    .schema("gc_commerce")
    .from("company_invitations")
    .update({
      status: "accepted",
      accepted_at: now,
      accepted_user_id: acceptingUserId,
    })
    .eq("token_hash", tokenHash)
    .eq("status", "pending");

  return { member_id: member.id, company_id: invite.company_id };
}
