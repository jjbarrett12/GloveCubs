import { NextRequest, NextResponse } from "next/server";
import { validateInviteToken } from "@/lib/admin/admin-company-invite";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  ctx: { params: { token: string } },
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Invites are not available in this deployment.", code: "missing_supabase_env" },
      { status: 503 },
    );
  }

  const { token } = ctx.params;
  if (!token || token.length < 20) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin() as any;

  try {
    const result = await validateInviteToken(supabase, token);
    if (!result.valid) {
      return NextResponse.json(
        {
          valid: false,
          reason: result.reason,
          message:
            result.reason === "expired" ? "This invitation has expired."
            : result.reason === "revoked" ? "This invitation was revoked."
            : result.reason === "accepted" ? "This invitation has already been used."
            : "Invitation not found.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      valid: true,
      email: result.invite.email,
      role: result.invite.role,
      company_name: result.invite.company_trade_name,
      expires_at: result.invite.expires_at,
    });
  } catch (err) {
    console.error("[GET /api/invites/[token]]", err);
    return NextResponse.json({ error: "Failed to validate invite" }, { status: 500 });
  }
}
