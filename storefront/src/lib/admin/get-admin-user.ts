import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Next `/admin/**` gate: any **active** `public.admin_users` row for the current Supabase auth user is treated as a
 * **trusted global operator** (no per-company ACL on these routes yet). Handlers must still avoid leaking secrets in
 * JSON; cross-company reads are intentional for internal ops until real ACLs ship.
 */
export async function getAdminUser(): Promise<{ id: string } | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return null;
  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("id, is_active")
    .eq("id", session.user.id)
    .eq("is_active", true)
    .single();
  if (!adminUser) return null;
  return { id: (adminUser as { id: string }).id };
}
