import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { isB2bTierCode } from "@/lib/pricing/b2b-tier-meta";

const bodySchema = z.object({
  b2b_pricing_tier_code: z.enum(["cub", "grizzly", "kodiak"]),
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

  const code = parsed.data.b2b_pricing_tier_code;
  if (!isB2bTierCode(code)) {
    return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin() as any;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("companies")
    .update({
      b2b_pricing_tier_code: code,
      updated_at: now,
    })
    .eq("id", companyId)
    .select("id, b2b_pricing_tier_code, trade_name, updated_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  return NextResponse.json({ company: data });
}
