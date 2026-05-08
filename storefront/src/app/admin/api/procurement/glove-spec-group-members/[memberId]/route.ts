import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { appendProcurementEvent } from "@/lib/procurement/opportunity-service";
import { ProcurementEventType } from "@/lib/procurement/event-taxonomy";

const patchSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  units_per_line_uom: z.number().positive().optional(),
  procurement_opportunity_id: z.string().uuid().optional(),
});

export async function PATCH(request: NextRequest, context: { params: { memberId: string } }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const memberId = context.params.memberId;
  if (!memberId) return NextResponse.json({ error: "Missing member id" }, { status: 400 });
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
  if (parsed.data.decision === "approve" && parsed.data.units_per_line_uom == null) {
    return NextResponse.json({ error: "units_per_line_uom required on approve" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin() as any;
  const now = new Date().toISOString();

  if (parsed.data.decision === "reject") {
    const { error } = await supabase
      .schema("gc_commerce")
      .from("glove_spec_group_members")
      .update({ valid_to: now, updated_at: now })
      .eq("id", memberId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, member_id: memberId, status: "rejected" });
  }

  const { error } = await supabase
    .schema("gc_commerce")
    .from("glove_spec_group_members")
    .update({
      approved_by: admin.id,
      approved_at: now,
      decision_source: "operator",
      units_per_line_uom: parsed.data.units_per_line_uom ?? null,
      updated_at: now,
    })
    .eq("id", memberId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: row } = await supabase
    .schema("gc_commerce")
    .from("glove_spec_group_members")
    .select("spec_group_id, catalog_product_id")
    .eq("id", memberId)
    .single();

  if (parsed.data.procurement_opportunity_id && row) {
    const okEv = await appendProcurementEvent(supabase, parsed.data.procurement_opportunity_id, ProcurementEventType.spec_group_member_approved, {
      member_id: memberId,
      spec_group_id: (row as { spec_group_id: string }).spec_group_id,
      catalog_product_id: (row as { catalog_product_id: string }).catalog_product_id,
      decided_by: admin.id,
    });
    if (!okEv) {
      return NextResponse.json({ error: "procurement_event_append_failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, member_id: memberId, status: "approved" });
}
