import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { PASSWORD_RESET_NEXT_PATH, safeAuthCallbackNextPath } from "@/lib/auth/password-reset";
import { resolveStorefrontPublicOrigin } from "@/lib/auth/storefront-origin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = safeAuthCallbackNextPath(requestUrl.searchParams.get("next"));
  const origin = resolveStorefrontPublicOrigin(requestUrl.origin) ?? requestUrl.origin;

  if (!code) {
    return NextResponse.redirect(`${origin}${PASSWORD_RESET_NEXT_PATH}?issue=invalid_link`);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) {
    return NextResponse.redirect(`${origin}${PASSWORD_RESET_NEXT_PATH}?issue=env`);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("[auth/callback] exchange failed", error.message?.slice(0, 120) ?? "unknown");
    return NextResponse.redirect(`${origin}${PASSWORD_RESET_NEXT_PATH}?issue=invalid_link`);
  }

  return NextResponse.redirect(`${origin}${nextPath}`);
}
