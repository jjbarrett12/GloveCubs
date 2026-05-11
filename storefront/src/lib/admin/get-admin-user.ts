import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    return { kind: "sign_in_required" };
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(url, key, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
    },
  });
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return { kind: "sign_in_required" };

  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("id, is_active")
    .eq("id", session.user.id)
    .eq("is_active", true)
    .single();
  if (!adminUser) return { kind: "not_admin" };

  return {
    kind: "ok",
    userId: session.user.id,
    email: session.user.email ?? null,
  };
}

export async function getAdminUser(): Promise<{ id: string } | null> {
  const r = await resolveAdminAccess();
  if (r.kind !== "ok") return null;
  return { id: r.userId };
}
