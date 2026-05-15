import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { createCompany, isValidCompanySlug } from "@/lib/admin/admin-company-write";

const bodySchema = z.object({
  trade_name: z.string().trim().min(1).max(200),
  legal_name: z.string().trim().max(300).optional().nullable(),
  slug: z.string().trim().max(64).optional().nullable(),
  country_code: z
    .string()
    .trim()
    .max(2)
    .optional()
    .nullable()
    .refine((v) => !v || /^[A-Za-z]{2}$/.test(v), { message: "Invalid country code" }),
  status: z.enum(["active", "suspended", "archived"]).optional(),
  b2b_pricing_tier_code: z.enum(["cub", "grizzly", "kodiak"]).optional(),
});

export async function POST(request: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
  const slug = data.slug?.trim().toLowerCase();
  if (slug && !isValidCompanySlug(slug)) {
    return NextResponse.json({ error: "Invalid slug format" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin() as any;

  try {
    const company = await createCompany(supabase, {
      trade_name: data.trade_name,
      legal_name: data.legal_name,
      slug: slug || undefined,
      country_code: data.country_code?.toUpperCase() ?? null,
      status: data.status,
      b2b_pricing_tier_code: data.b2b_pricing_tier_code,
    });
    return NextResponse.json({ company }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Create failed";
    if (msg === "slug_conflict" || msg === "slug_exhausted") {
      return NextResponse.json({ error: "Slug already in use" }, { status: 409 });
    }
    if (msg === "invalid_country_code" || msg === "invalid_tier" || msg === "invalid_status") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("[POST /admin/api/companies]", err);
    return NextResponse.json({ error: "Failed to create company" }, { status: 500 });
  }
}
