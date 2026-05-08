import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const postSchema = z.object({
  from_catalog_product_id: z.string().uuid(),
  to_catalog_product_id: z.string().uuid(),
  spec_group_id: z.string().uuid(),
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
    .from("substitution_candidates")
    .insert({
      from_catalog_product_id: parsed.data.from_catalog_product_id,
      to_catalog_product_id: parsed.data.to_catalog_product_id,
      spec_group_id: parsed.data.spec_group_id,
      status: "pending",
      updated_at: now,
    })
    .select("id, status, from_catalog_product_id, to_catalog_product_id, spec_group_id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ substitution: data });
}
