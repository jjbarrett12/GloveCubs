import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { revokeCompanyInvite } from "@/lib/admin/admin-company-invite";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";

export async function POST(
  request: NextRequest,
  ctx: { params: { companyId: string; inviteId: string } },
) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase server environment is not configured.", code: "missing_supabase_env" },
      { status: 503 },
    );
  }

  const { companyId, inviteId } = ctx.params;
  if (!z.string().uuid().safeParse(companyId).success) {
    return NextResponse.json({ error: "Invalid company id" }, { status: 400 });
  }
  if (!z.string().uuid().safeParse(inviteId).success) {
    return NextResponse.json({ error: "Invalid invite id" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin() as any;

  try {
    const result = await revokeCompanyInvite(supabase, inviteId);
    if (!result.revoked) {
      return NextResponse.json(
        { error: "Invite not found or already revoked/accepted" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, message: "Invitation revoked." });
  } catch (err) {
    console.error("[POST /admin/api/companies/[companyId]/invites/[inviteId]/revoke]", err);
    return NextResponse.json({ error: "Failed to revoke invite" }, { status: 500 });
  }
}
