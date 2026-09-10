import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { recomputeInvoiceLineComparison } from "@/lib/procurement/invoice-line-comparison-run";

const packSchema = z.object({
  quantity_uom: z.enum(["EA", "BX", "CS"]).nullable().optional(),
  gloves_per_box: z.number().positive().nullable().optional(),
  boxes_per_case: z.number().positive().nullable().optional(),
  gloves_per_case: z.number().positive().nullable().optional(),
});

export async function PATCH(request: NextRequest, context: { params: { lineId: string } }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const lineId = context.params.lineId;
  if (!lineId) return NextResponse.json({ error: "Missing line id" }, { status: 400 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = packSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  const supabase = getSupabaseAdmin() as any;
  const { data: line, error: lineErr } = await supabase
    .schema("gc_commerce")
    .from("invoice_lines")
    .select("id, uploaded_invoice_id, field_provenance")
    .eq("id", lineId)
    .maybeSingle();
  if (lineErr || !line) return NextResponse.json({ error: "Line not found" }, { status: 404 });
  const prev = ((line as { field_provenance?: Record<string, unknown> }).field_provenance ?? {}) as Record<string, unknown>;
  const now = new Date().toISOString();
  const { error } = await supabase
    .schema("gc_commerce")
    .from("invoice_lines")
    .update({
      ...parsed.data,
      field_provenance: { ...prev, pack_corrected_by: "operator", pack_corrected_at: now },
      updated_at: now,
    })
    .eq("id", lineId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data: inv } = await supabase
    .schema("gc_commerce")
    .from("uploaded_invoices")
    .select("company_id")
    .eq("id", (line as { uploaded_invoice_id: string }).uploaded_invoice_id)
    .maybeSingle();
  const comparison = await recomputeInvoiceLineComparison(
    supabase,
    lineId,
    (inv as { company_id?: string | null } | null)?.company_id ?? null,
  );
  return NextResponse.json({ ok: true, comparison });
}
