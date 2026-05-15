import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { isValidCompanySlug, updateCompanyProfile } from "@/lib/admin/admin-company-write";

const bodySchema = z.object({
  trade_name: z.string().trim().min(1).max(200),
  legal_name: z.string().trim().max(300).optional().nullable(),
  slug: z.string().trim().min(2).max(64),
  country_code: z
    .string()
    .trim()
    .max(2)
    .optional()
    .nullable()
    .refine((v) => !v || /^[A-Za-z]{2}$/.test(v), { message: "Invalid country code" }),
  status: z.enum(["active", "suspended", "archived"]),
});

export async function PATCH(request: NextRequest, ctx: { params: { companyId: string } }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  const data = parsed.data;
  const slug = data.slug.trim().toLowerCase();
  if (!isValidCompanySlug(slug)) {
    return NextResponse.json({ error: "Invalid slug format" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin() as any;

  try {
    const company = await updateCompanyProfile(supabase, companyId, {
      trade_name: data.trade_name,
      legal_name: data.legal_name,
      slug,
      country_code: data.country_code?.toUpperCase() ?? null,
      status: data.status,
    });
    return NextResponse.json({ company });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Update failed";
    if (msg === "slug_conflict") {
      return NextResponse.json({ error: "Slug already in use" }, { status: 409 });
    }
    if (msg === "invalid_country_code" || msg === "invalid_status" || msg === "invalid_slug") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("[PATCH /admin/api/companies/[companyId]]", err);
    return NextResponse.json({ error: "Failed to update company" }, { status: 500 });
  }
}
