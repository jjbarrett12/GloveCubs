import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addCompanyMemberForAdmin } from "@/lib/admin/admin-company-member-write";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";

const bodySchema = z.object({
  email: z.string().trim().min(3).max(320),
  role: z.enum(["owner", "admin", "member", "viewer", "billing"]).optional(),
  display_name: z.string().trim().max(200).optional().nullable(),
});

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

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = getSupabaseAdmin() as any;

  try {
    const result = await addCompanyMemberForAdmin(
      supabase,
      companyId,
      {
        email: parsed.data.email,
        role: parsed.data.role,
        display_name: parsed.data.display_name,
      },
      admin.id,
    );

    const status = result.outcome === "already_member" ? 200 : 201;
    return NextResponse.json(
      {
        ok: true,
        outcome: result.outcome,
        member: result.member,
        auth_user_created: result.auth_user_created,
        password_setup_required: result.password_setup_required,
        message:
          result.outcome === "already_member" ?
            "Buyer is already linked to this customer account."
          : result.password_setup_required ?
            "Buyer account created and linked. They must use Forgot password on the login page with this email to set a password before first sign-in."
          : result.outcome === "linked_existing_user" ?
            "Existing buyer account linked to this customer account."
          : "Buyer linked to this customer account.",
      },
      { status },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Add member failed";
    if (msg === "invalid_email") {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }
    if (msg === "invalid_role") {
      return NextResponse.json({ error: "Unsupported role" }, { status: 400 });
    }
    if (msg === "company_not_found") {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }
    console.error("[POST /admin/api/companies/[companyId]/members]", err);
    return NextResponse.json({ error: "Failed to add company member" }, { status: 500 });
  }
}
