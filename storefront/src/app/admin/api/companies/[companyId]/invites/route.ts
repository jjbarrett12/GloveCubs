import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createCompanyInvite, listCompanyInvites } from "@/lib/admin/admin-company-invite";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";

const createBodySchema = z.object({
  email: z.string().trim().min(3).max(320),
  role: z.enum(["owner", "admin", "member", "viewer", "billing"]).optional(),
});

export async function GET(request: NextRequest, ctx: { params: { companyId: string } }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase server environment is not configured.", code: "missing_supabase_env" },
      { status: 503 },
    );
  }

  const companyId = ctx.params.companyId;
  if (!z.string().uuid().safeParse(companyId).success) {
    return NextResponse.json({ error: "Invalid company id" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin() as any;

  try {
    const invites = await listCompanyInvites(supabase, companyId);
    return NextResponse.json({ ok: true, invites });
  } catch (err) {
    console.error("[GET /admin/api/companies/[companyId]/invites]", err);
    return NextResponse.json({ error: "Failed to list invites" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, ctx: { params: { companyId: string } }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase server environment is not configured.", code: "missing_supabase_env" },
      { status: 503 },
    );
  }

  const companyId = ctx.params.companyId;
  if (!z.string().uuid().safeParse(companyId).success) {
    return NextResponse.json({ error: "Invalid company id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = getSupabaseAdmin() as any;

  try {
    const result = await createCompanyInvite(supabase, {
      companyId,
      email: parsed.data.email,
      role: parsed.data.role,
      invitedByUserId: admin.id,
    });

    const inviteUrl = `/invite/${result.rawToken}`;

    return NextResponse.json(
      {
        ok: true,
        invite_id: result.id,
        invite_url: inviteUrl,
        raw_token: result.rawToken,
        expires_at: result.expiresAt,
        message: "Invitation created. Share the invite URL with the buyer.",
      },
      { status: 201 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Create invite failed";
    if (msg === "invalid_email") {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }
    if (msg === "invalid_role") {
      return NextResponse.json({ error: "Unsupported role" }, { status: 400 });
    }
    if (msg === "company_not_found") {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }
    if (msg === "active_invite_exists") {
      return NextResponse.json({ error: "An active invite already exists for this email" }, { status: 409 });
    }
    if (msg === "already_member") {
      return NextResponse.json({ error: "This email is already a member of this company" }, { status: 409 });
    }
    console.error("[POST /admin/api/companies/[companyId]/invites]", err);
    return NextResponse.json({ error: "Failed to create invite" }, { status: 500 });
  }
}
