import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { acceptCompanyInvite } from "@/lib/admin/admin-company-invite";
import { linkOrphanQuoteRequestsByEmail } from "@/lib/admin/admin-company-member-write";

export const dynamic = "force-dynamic";

/**
 * POST /api/invites/[token]/accept
 * Accepts a company invitation for the authenticated user (Bearer or cookie session).
 */
export async function POST(
  request: NextRequest,
  ctx: { params: { token: string } },
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const token = ctx.params.token?.trim();
  if (!token) {
    return NextResponse.json({ error: "Missing invite token" }, { status: 400 });
  }

  const authHeader = request.headers.get("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!bearer) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user?.id) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin() as any;
  try {
    const result = await acceptCompanyInvite(supabase, token, userData.user.id);
    const email = userData.user.email;
    if (email) {
      await linkOrphanQuoteRequestsByEmail(supabase, {
        email,
        companyId: result.company_id,
      }).catch(() => undefined);
    }
    return NextResponse.json({
      ok: true,
      company_id: result.company_id,
      member_id: result.member_id,
      redirect_path: "/account",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "accept_failed";
    if (msg === "email_mismatch") {
      return NextResponse.json(
        { error: "Signed-in email does not match this invitation email." },
        { status: 403 },
      );
    }
    if (msg.startsWith("invite_")) {
      return NextResponse.json({ error: msg.replace("invite_", "Invitation ") }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not accept invitation" }, { status: 500 });
  }
}
