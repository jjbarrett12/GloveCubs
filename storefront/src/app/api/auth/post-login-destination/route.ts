import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { resolveUserForPostLoginDestination } from "@/lib/auth/post-login-session";
import { recoverSelfSignupIfNeeded } from "@/lib/auth/self-signup";
import { resolveCustomerProcurementGate } from "@/lib/procurement/customer-procurement-session";

export const dynamic = "force-dynamic";

/**
 * After password sign-in, LoginClient calls this to choose `/admin` vs `/account`
 * when no explicit `next` query was provided. Sends `Authorization: Bearer` with the
 * fresh access token so this route does not race cookie persistence on the first fetch.
 */
const DEBUG_POST_LOGIN = process.env.GC_POST_LOGIN_DEBUG === "1";

function supabaseHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

async function resolveBuyerGateForUserId(
  svc: any,
  userId: string,
): Promise<{
  buyerDefaultPath: "/account/quotes" | "/account" | "/signup/complete";
  buyerIssue: "company_inactive" | "no_membership" | "needs_signup_complete" | null;
}> {
  const { data: members, error: memErr } = await svc
    .schema("gc_commerce")
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .limit(1);
  if (memErr) {
    return { buyerDefaultPath: "/account", buyerIssue: null };
  }
  if (!members || members.length === 0) {
    return { buyerDefaultPath: "/account", buyerIssue: "no_membership" };
  }

  const gate = await resolveCustomerProcurementGate(svc);
  if (gate.kind === "ready") {
    return { buyerDefaultPath: "/account/quotes", buyerIssue: null };
  }
  if (gate.kind === "company_not_active") {
    return { buyerDefaultPath: "/account", buyerIssue: "company_inactive" };
  }
  if (gate.kind === "no_membership") {
    return { buyerDefaultPath: "/account", buyerIssue: "no_membership" };
  }
  return { buyerDefaultPath: "/account", buyerIssue: null };
}

export async function GET(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !anon || !key) {
    return NextResponse.json(
      {
        error:
          "Login routing is unavailable because Supabase environment variables are missing or blank on the server.",
        code: "missing_supabase_env",
        ...(DEBUG_POST_LOGIN
          ? {
              diag: {
                logged_in: false,
                user_id_suffix: null as string | null,
                admin_row_found: false,
                admin_active: false,
                destination: null,
                session_via: "none" as const,
                supabase_url_host: url ? supabaseHost(url) : null,
                reason: "missing_supabase_env",
              },
            }
          : {}),
      },
      { status: 503 },
    );
  }

  const cookieStore = await cookies();
  const auth = await resolveUserForPostLoginDestination({
    supabaseUrl: url,
    anonKey: anon,
    serviceRoleKey: key,
    authorizationHeader: req.headers.get("authorization"),
    cookieGet: (name: string) => cookieStore.get(name)?.value,
  });

  if (!auth.user) {
    return NextResponse.json({
      path: "/account" as const,
      ...(DEBUG_POST_LOGIN
        ? {
            authDebug: "no_user_bearer_or_cookie" as const,
            diag: {
              logged_in: false,
              user_id_suffix: null,
              admin_row_found: false,
              admin_active: false,
              destination: "/account",
              session_via: auth.via,
              supabase_url_host: supabaseHost(url),
              reason: "no_user_bearer_or_cookie",
            },
          }
        : {}),
    });
  }

  const svc = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as any;
  const { data: adminUser } = await svc
    .from("admin_users")
    .select("id, is_active")
    .eq("id", auth.user.id)
    .eq("is_active", true)
    .maybeSingle();

  const path = adminUser ? ("/admin" as const) : ("/account" as const);
  const adminRowFound = Boolean(adminUser);
  const adminActive = adminRowFound;

  let buyerDefaultPath: "/account/quotes" | "/account" | "/signup/complete" = "/account";
  let buyerIssue: "company_inactive" | "no_membership" | "needs_signup_complete" | null = null;

  if (!adminUser) {
    const recovery = await recoverSelfSignupIfNeeded(
      svc,
      auth.user.id,
      (auth.user.user_metadata ?? {}) as Record<string, unknown>,
    );
    if (recovery.kind === "needs_complete" || recovery.kind === "failed") {
      buyerDefaultPath = "/signup/complete";
      buyerIssue = "needs_signup_complete";
    } else {
      const buyer = await resolveBuyerGateForUserId(svc, auth.user.id);
      buyerDefaultPath = buyer.buyerDefaultPath;
      buyerIssue = buyer.buyerIssue;
    }
  }

  return NextResponse.json({
    path,
    buyer_default_path: adminUser ? "/account" : buyerDefaultPath,
    buyer_issue: buyerIssue,
    ...(DEBUG_POST_LOGIN
      ? {
          authDebug: adminUser ? ("active_admin_row" as const) : ("no_admin_row_for_auth_uid" as const),
          diag: {
            logged_in: true,
            user_id_suffix: auth.user.id.length >= 12 ? auth.user.id.slice(-12) : auth.user.id,
            admin_row_found: adminRowFound,
            admin_active: adminActive,
            destination: path,
            session_via: auth.via,
            supabase_url_host: supabaseHost(url),
            reason: adminUser ? "admin_ok" : "no_admin_row",
          },
        }
      : {}),
  });
}
