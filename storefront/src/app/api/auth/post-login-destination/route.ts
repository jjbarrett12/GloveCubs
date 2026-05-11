import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

/**
 * After password sign-in, LoginClient calls this to choose `/admin` vs `/account`
 * when no explicit `next` query was provided. Requires session cookies from the client.
 */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    return NextResponse.json({ path: "/account" as const });
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
  if (!session?.user) {
    return NextResponse.json({ path: "/account" as const });
  }

  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("id")
    .eq("id", session.user.id)
    .eq("is_active", true)
    .maybeSingle();

  const path = adminUser ? ("/admin" as const) : ("/account" as const);
  return NextResponse.json({ path });
}
