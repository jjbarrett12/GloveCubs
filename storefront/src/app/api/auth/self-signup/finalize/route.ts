import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resolveUserForPostLoginDestination } from "@/lib/auth/post-login-session";
import { finalizeSelfSignupForUser } from "@/lib/auth/self-signup";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) {
    return NextResponse.json(
      {
        error: "Signup is unavailable because Supabase public environment variables are missing or blank.",
        code: "missing_supabase_env",
      },
      { status: 503 },
    );
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      {
        error: "Signup is unavailable because server Supabase environment variables are missing or blank.",
        code: "missing_supabase_env",
      },
      { status: 503 },
    );
  }

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  if (body && typeof body === "object" && body !== null && "company_id" in body) {
    return NextResponse.json({ error: "Invalid request.", code: "invalid_request" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const auth = await resolveUserForPostLoginDestination({
    supabaseUrl: url,
    anonKey: anon,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
    authorizationHeader: req.headers.get("authorization"),
    cookieGet: (name: string) => cookieStore.get(name)?.value,
  });

  if (!auth.user) {
    return NextResponse.json({ error: "Sign in required.", code: "unauthorized" }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const result = await finalizeSelfSignupForUser(supabase, auth.user.id, auth.user.user_metadata);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "finalize_failed";
    if (message === "missing_signup_metadata") {
      return NextResponse.json({ error: "Signup profile data is missing.", code: message }, { status: 422 });
    }
    console.error("[self-signup/finalize] failed", message.slice(0, 120));
    return NextResponse.json({ error: "Could not complete account setup.", code: "finalize_failed" }, { status: 500 });
  }
}
