import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { markRecommendationReviewed } from "@/lib/procurement/recommendation-lifecycle-service";

const patchSchema = z.object({
  trust_status: z.literal("operator_reviewed"),
  procurement_opportunity_id: z.string().uuid(),
});

export async function GET(_request: NextRequest, context: { params: { id: string } }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = context.params.id;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const supabase = getSupabaseAdmin() as any;
  const { data, error } = await supabase.schema("gc_commerce").from("savings_opportunities").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ opportunity: data });
}

/** @deprecated Prefer server action `recommendationMarkReviewedAction` — thin wrapper over lifecycle service. */
export async function PATCH(request: NextRequest, context: { params: { id: string } }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = context.params.id;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  const supabase = getSupabaseAdmin() as any;
  const r = await markRecommendationReviewed(supabase, {
    savingsOpportunityId: id,
    procurementOpportunityId: parsed.data.procurement_opportunity_id,
    actorId: admin.id,
  });
  if (!r.ok) {
    return NextResponse.json({ error: r.error }, { status: 400 });
  }
  const { data: row } = await supabase.schema("gc_commerce").from("savings_opportunities").select("*").eq("id", id).single();
  return NextResponse.json({ ok: true, id, trust_status: parsed.data.trust_status, row });
}
