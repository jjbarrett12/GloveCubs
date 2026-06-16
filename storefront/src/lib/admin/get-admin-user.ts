import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { resolveUserFromAdminCookies } from "@/lib/auth/post-login-session";

/**
 * Next `/admin/**` gate: any **active** `public.admin_users` row for the current Supabase auth user is treated as a
 * **trusted global operator** (no per-company ACL on these routes yet). Handlers must still avoid leaking secrets in
 * JSON; cross-company reads are intentional for internal ops until real ACLs ship.
 */

export type AdminAccessResult =
  | { kind: "ok"; userId: string; email: string | null }
  | { kind: "sign_in_required" }
  | { kind: "not_admin" };

export async function resolveAdminAccess(): Promise<AdminAccessResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !anon || !key) {
    return { kind: "sign_in_required" };
  }

  const cookieStore = await cookies();
  const user = await resolveUserFromAdminCookies(url, anon, cookieStore);
  if (!user) return { kind: "sign_in_required" };

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("id, is_active")
    .eq("id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (!adminUser) return { kind: "not_admin" };

  return {
    kind: "ok",
    userId: user.id,
    email: user.email ?? null,
  };
}

export async function getAdminUser(): Promise<{ id: string } | null> {
  const op = await getAdminOperator();
  return op ? { id: op.id } : null;
}

/** Operator identity for server-side Express admin BFF (includes email for JWT + audit logs). */
export async function getAdminOperator(): Promise<{ id: string; email: string | null } | null> {
  const r = await resolveAdminAccess();
  if (r.kind !== "ok") return null;
  return { id: r.userId, email: r.email };
}
