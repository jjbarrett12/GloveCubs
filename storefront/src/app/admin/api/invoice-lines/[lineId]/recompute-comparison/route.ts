import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { recomputeInvoiceLineComparison } from "@/lib/procurement/invoice-line-comparison-run";

export async function POST(_request: NextRequest, context: { params: { lineId: string } }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const lineId = context.params.lineId;
  if (!lineId) return NextResponse.json({ error: "Missing line id" }, { status: 400 });
  const supabase = getSupabaseAdmin() as any;
  const { data: line, error } = await supabase
    .schema("gc_commerce")
    .from("invoice_lines")
    .select("id, uploaded_invoice_id")
    .eq("id", lineId)
    .maybeSingle();
  if (error || !line) return NextResponse.json({ error: "Line not found" }, { status: 404 });
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
