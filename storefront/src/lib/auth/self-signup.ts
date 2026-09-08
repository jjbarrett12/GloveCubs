/**
 * Server-only self-signup provisioning: gc_commerce company + member.
 * No legacy public.users writes.
 */

import { createCompany } from "@/lib/admin/admin-company-write";
import { sanitizeSignupText, SELF_SIGNUP_DEFAULT_REDIRECT } from "@/lib/auth/self-signup-form";

const NAME_MAX = 80;
const COMPANY_MAX = 120;
const SIGNUP_COMPLETE_PATH = "/signup/complete";

export type FinalizeSelfSignupResult = {
  company_id: string;
  member_id: string;
  already_provisioned: boolean;
  redirect_path: typeof SELF_SIGNUP_DEFAULT_REDIRECT;
};

export type SelfSignupRecoveryResult =
  | { kind: "ready"; result: FinalizeSelfSignupResult }
  | { kind: "needs_complete"; redirect_path: typeof SIGNUP_COMPLETE_PATH }
  | { kind: "failed"; message: string; retryable: boolean };

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

/** True when Auth metadata looks like a storefront self-signup that can be finalized. */
export function canAttemptSelfSignupRecovery(
  userMetadata: Record<string, unknown> | null | undefined,
): boolean {
  return parseSelfSignupMetadata(userMetadata) != null;
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

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Claim a per-user finalize lock. Returns true if this caller owns the claim.
 * On conflict, waits briefly and re-checks membership so concurrent requests converge.
 */
async function claimFinalizeLock(supabase: any, userId: string): Promise<"claimed" | "waited_ready" | "busy"> {
  const { error } = await supabase.schema("gc_commerce").from("self_signup_finalize_locks").insert({
    user_id: userId,
  });
  if (!error) return "claimed";
  if (error.code === "23505" || /duplicate|unique/i.test(String(error.message ?? ""))) {
    for (let i = 0; i < 5; i++) {
      await sleep(40 + i * 40);
      const raced = await fetchExistingMembership(supabase, userId);
      if (raced) return "waited_ready";
    }
    return "busy";
  }
  throw error;
}

async function releaseFinalizeLock(supabase: any, userId: string): Promise<void> {
  await supabase.schema("gc_commerce").from("self_signup_finalize_locks").delete().eq("user_id", userId);
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

  const lock = await claimFinalizeLock(supabase, userId);
  if (lock === "waited_ready") {
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
  if (lock === "busy") {
    throw new Error("finalize_in_progress");
  }

  // Re-check after claiming lock (another request may have finished between check and claim).
  const existingAfterLock = await fetchExistingMembership(supabase, userId);
  if (existingAfterLock) {
    return {
      company_id: existingAfterLock.company_id,
      member_id: existingAfterLock.member_id,
      already_provisioned: true,
      redirect_path: SELF_SIGNUP_DEFAULT_REDIRECT,
    };
  }

  try {
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
  } catch (err) {
    await releaseFinalizeLock(supabase, userId).catch(() => {});
    throw err;
  }
}

/**
 * Safe recovery for authenticated users missing membership (missed /signup/complete).
 * Does not create companies without signup metadata.
 */
export async function recoverSelfSignupIfNeeded(
  supabase: any,
  userId: string,
  userMetadata: Record<string, unknown> | null | undefined,
): Promise<SelfSignupRecoveryResult> {
  try {
    const existing = await fetchExistingMembership(supabase, userId);
    if (existing) {
      return {
        kind: "ready",
        result: {
          company_id: existing.company_id,
          member_id: existing.member_id,
          already_provisioned: true,
          redirect_path: SELF_SIGNUP_DEFAULT_REDIRECT,
        },
      };
    }

    if (!canAttemptSelfSignupRecovery(userMetadata)) {
      return { kind: "needs_complete", redirect_path: SIGNUP_COMPLETE_PATH };
    }

    const result = await finalizeSelfSignupForUser(supabase, userId, userMetadata);
    return { kind: "ready", result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "finalize_failed";
    if (message === "missing_signup_metadata") {
      return { kind: "needs_complete", redirect_path: SIGNUP_COMPLETE_PATH };
    }
    if (message === "finalize_in_progress") {
      return { kind: "failed", message: "Account setup is still in progress. Try again in a moment.", retryable: true };
    }
    return {
      kind: "failed",
      message: "Could not complete account setup.",
      retryable: true,
    };
  }
}
