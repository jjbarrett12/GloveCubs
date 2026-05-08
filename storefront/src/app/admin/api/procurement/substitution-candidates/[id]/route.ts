import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { appendProcurementEvent } from "@/lib/procurement/opportunity-service";
import { ProcurementEventType } from "@/lib/procurement/event-taxonomy";

const patchSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  procurement_opportunity_id: z.string().uuid().optional(),
});

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
  const now = new Date().toISOString();
  const status = parsed.data.decision === "approve" ? "approved" : "rejected";
  const patch: Record<string, unknown> = {
    status,
    updated_at: now,
  };
  if (parsed.data.decision === "approve") {
    patch.approved_by = admin.id;
    patch.approved_at = now;
  } else {
    patch.approved_by = null;
    patch.approved_at = null;
  }
  const { error } = await supabase.schema("gc_commerce").from("substitution_candidates").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (parsed.data.decision === "approve" && parsed.data.procurement_opportunity_id) {
    const { data: row } = await supabase
      .schema("gc_commerce")
      .from("substitution_candidates")
      .select("from_catalog_product_id, to_catalog_product_id, spec_group_id")
      .eq("id", id)
      .single();
    if (row) {
      const okEv = await appendProcurementEvent(
        supabase,
        parsed.data.procurement_opportunity_id,
        ProcurementEventType.substitution_candidate_approved,
        {
          substitution_candidate_id: id,
          from_catalog_product_id: (row as { from_catalog_product_id: string }).from_catalog_product_id,
          to_catalog_product_id: (row as { to_catalog_product_id: string }).to_catalog_product_id,
          spec_group_id: (row as { spec_group_id: string }).spec_group_id,
          decided_by: admin.id,
        }
      );
      if (!okEv) {
        return NextResponse.json({ error: "procurement_event_append_failed" }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ ok: true, id, status });
}
