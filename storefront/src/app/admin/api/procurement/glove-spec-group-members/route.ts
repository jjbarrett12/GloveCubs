import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const postSchema = z.object({
  spec_group_id: z.string().uuid(),
  catalog_product_id: z.string().uuid(),
  units_per_line_uom: z.number().positive().optional().nullable(),
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
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  const supabase = getSupabaseAdmin() as any;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("glove_spec_group_members")
    .insert({
      spec_group_id: parsed.data.spec_group_id,
      catalog_product_id: parsed.data.catalog_product_id,
      units_per_line_uom: parsed.data.units_per_line_uom ?? null,
      decision_source: "system",
      updated_at: now,
    })
    .select("id, spec_group_id, catalog_product_id, approved_at, units_per_line_uom")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ member: data });
}
