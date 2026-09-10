import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { upsertCompetitorAlias } from "@/lib/procurement/competitor-write";

const postSchema = z.object({
  alias_type: z.enum(["sku", "upc", "invoice_description", "manufacturer_sku"]),
  raw_value: z.string().min(1).max(4000),
});

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const competitorId = context.params.id;
  if (!competitorId) return NextResponse.json({ error: "Missing id" }, { status: 400 });
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
  const { data: exists } = await supabase
    .schema("gc_commerce")
    .from("competitor_products")
    .select("id")
    .eq("id", competitorId)
    .maybeSingle();
  if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const a = await upsertCompetitorAlias(supabase, {
    competitor_product_id: competitorId,
    alias_type: parsed.data.alias_type,
    raw_value: parsed.data.raw_value,
    source: "operator",
  });
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: 500 });
  return NextResponse.json({ ok: true });
}
