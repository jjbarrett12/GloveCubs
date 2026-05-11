/**
 * Customer procurement workspace: Supabase auth user + canonical active gc_commerce company.
 * Server-only; uses anon cookie client for auth then service-role for membership + active_company_id.
 */

import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { redirect } from "next/navigation";
import { resolveActiveCompanyId } from "@/lib/procurement/repo-active-company-resolve";

export type CustomerProcurementSession = {
  userId: string;
  companyId: string;
};

export type CustomerProcurementGate =
  | { kind: "ready"; session: CustomerProcurementSession }
  | { kind: "sign_in_required" }
  | { kind: "no_membership"; userId: string }
  | { kind: "active_company_required"; userId: string; companyIds: string[] };

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

  const r = await resolveActiveCompanyId(String(user.id), { supabase: supabaseAdmin as any });
  if (r.reason === "no_membership") {
    return { kind: "no_membership", userId: user.id };
  }
  if (r.requiresSelection) {
    return { kind: "active_company_required", userId: user.id, companyIds: r.memberships || [] };
  }
  if (!r.companyId) {
    return { kind: "no_membership", userId: user.id };
  }
  return { kind: "ready", session: { userId: user.id, companyId: r.companyId } };
}

/**
 * Returns null when unauthenticated, no membership, or active company unresolved (multi-company).
 */
export async function resolveCustomerProcurementSession(
  supabaseAdmin: unknown
): Promise<CustomerProcurementSession | null> {
  const g = await resolveCustomerProcurementGate(supabaseAdmin);
  if (g.kind === "ready") return g.session;
  return null;
}

/**
 * Enforce procurement access: redirects to home, picker, or returns session.
 */
export async function requireCustomerProcurementSession(
  supabaseAdmin: unknown
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
  redirect("/login?issue=no_membership");
}

export async function assertCustomerCompanyAccess(
  supabaseAdmin: any,
  userId: string,
  companyId: string
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .schema("gc_commerce")
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .maybeSingle();
  return !error && Boolean(data);
}
