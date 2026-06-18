/**
 * Customer procurement workspace: Supabase auth user + canonical active gc_commerce company.
 * Server-only; uses anon cookie client for auth then service-role for membership + active_company_id.
 */

import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { redirect } from "next/navigation";
import {
  COMPANY_NOT_ACTIVE_BUYER_MESSAGE,
  filterActiveMembershipCompanyIds,
  isPortalActiveCompanyStatus,
} from "@/lib/procurement/customer-procurement-company-gate";
import { computeActiveCompanyResolution } from "@/lib/procurement/repo-active-company-resolve";

export type CustomerProcurementSession = {
  userId: string;
  companyId: string;
};

export type CustomerProcurementGate =
  | { kind: "ready"; session: CustomerProcurementSession }
  | { kind: "sign_in_required" }
  | { kind: "no_membership"; userId: string }
  | { kind: "company_not_active"; userId: string }
  | { kind: "active_company_required"; userId: string; companyIds: string[] };

export { COMPANY_NOT_ACTIVE_BUYER_MESSAGE };

export function redirectsToAccountHub(
  gate: CustomerProcurementGate,
): gate is
  | { kind: "no_membership"; userId: string }
  | { kind: "company_not_active"; userId: string }
  | { kind: "active_company_required"; userId: string; companyIds: string[] } {
  return (
    gate.kind === "no_membership" ||
    gate.kind === "company_not_active" ||
    gate.kind === "active_company_required"
  );
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

async function resolveAuthenticatedPortalGate(
  supabaseAdmin: any,
  userId: string,
): Promise<Exclude<CustomerProcurementGate, { kind: "sign_in_required" }>> {
  const { data: members, error: memErr } = await supabaseAdmin
    .schema("gc_commerce")
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .order("company_id", { ascending: true });
  if (memErr) throw memErr;

  const membershipIds = (members ?? [])
    .map((row: { company_id?: string | null }) => String(row.company_id ?? "").trim())
    .filter(isUuid);

  if (membershipIds.length === 0) {
    return { kind: "no_membership", userId };
  }

  const { data: companies, error: coErr } = await supabaseAdmin
    .schema("gc_commerce")
    .from("companies")
    .select("id, status")
    .in("id", membershipIds);
  if (coErr) throw coErr;

  const { activeIds, allInactiveOrMissing } = filterActiveMembershipCompanyIds(
    membershipIds,
    companies ?? [],
  );
  if (allInactiveOrMissing) {
    return { kind: "company_not_active", userId };
  }

  const { data: profile, error: profErr } = await supabaseAdmin
    .from("users")
    .select("active_company_id")
    .eq("id", userId)
    .maybeSingle();
  if (profErr) throw profErr;

  const storedRaw =
    profile?.active_company_id != null ? String(profile.active_company_id).trim() : null;
  const storedActive = storedRaw && isUuid(storedRaw) && activeIds.includes(storedRaw) ? storedRaw : null;

  const computed = computeActiveCompanyResolution({
    membershipIdsSorted: activeIds,
    storedActive,
  });

  if (computed.bootstrapCompanyId) {
    await supabaseAdmin
      .from("users")
      .update({
        active_company_id: computed.bootstrapCompanyId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
  }

  if (computed.requiresSelection) {
    return { kind: "active_company_required", userId, companyIds: computed.memberships };
  }

  if (!computed.companyId) {
    return { kind: "company_not_active", userId };
  }

  return { kind: "ready", session: { userId, companyId: computed.companyId } };
}

/**
 * Full gate result for layouts (no redirect).
 */
export async function resolveCustomerProcurementGate(supabaseAdmin: unknown): Promise<CustomerProcurementGate> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url?.trim() || !anon?.trim()) {
    return { kind: "sign_in_required" };
  }

  const cookieStore = await cookies();
  const authClient = createServerClient(url.trim(), anon.trim(), {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
    },
  });
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user?.id) {
    return { kind: "sign_in_required" };
  }

  return resolveAuthenticatedPortalGate(supabaseAdmin as any, String(user.id));
}

/**
 * Returns null when unauthenticated, no membership, inactive company, or active company unresolved.
 */
export async function resolveCustomerProcurementSession(
  supabaseAdmin: unknown,
): Promise<CustomerProcurementSession | null> {
  const g = await resolveCustomerProcurementGate(supabaseAdmin);
  if (g.kind === "ready") return g.session;
  return null;
}

/**
 * Enforce procurement access: redirects to home, picker, or returns session.
 */
export async function requireCustomerProcurementSession(
  supabaseAdmin: unknown,
): Promise<CustomerProcurementSession> {
  const g = await resolveCustomerProcurementGate(supabaseAdmin);
  if (g.kind === "ready") return g.session;
  if (g.kind === "active_company_required") {
    redirect("/workspace/procurement/active-company");
  }
  if (g.kind === "sign_in_required") {
    const pathname = (await headers()).get("x-gc-pathname")?.trim() || "/workspace/procurement";
    const nextPath = pathname.startsWith("/workspace/") ? pathname : "/workspace/procurement";
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }
  if (g.kind === "company_not_active") {
    redirect("/login?issue=company_inactive");
  }
  redirect("/login?issue=no_membership");
}

export async function assertCustomerCompanyAccess(
  supabaseAdmin: any,
  userId: string,
  companyId: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .schema("gc_commerce")
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error || !data) return false;

  const { data: company, error: coErr } = await supabaseAdmin
    .schema("gc_commerce")
    .from("companies")
    .select("status")
    .eq("id", companyId)
    .maybeSingle();
  if (coErr || !company) return false;

  return isPortalActiveCompanyStatus(company.status);
}
