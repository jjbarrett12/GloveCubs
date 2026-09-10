import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { assertActiveCatalogProductExists } from "@/lib/catalog/assert-catalog-product-exists";

const patchSchema = z.object({
  status: z.enum(["approved", "rejected", "needs_review", "candidate"]),
  rationale: z.string().max(2000).optional().nullable(),
  invoice_line_id: z.string().uuid().optional(),
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
  if (parsed.data.status === "approved") {
    const { data: current } = await supabase
      .schema("gc_commerce")
      .from("competitor_equivalencies")
      .select("catalog_product_id")
      .eq("id", id)
      .maybeSingle();
    const catalogProductId = (current as { catalog_product_id?: string | null } | null)?.catalog_product_id;
    if (!catalogProductId || !(await assertActiveCatalogProductExists(supabase, catalogProductId))) {
      return NextResponse.json({ error: "invalid_or_inactive_catalog_product_id" }, { status: 400 });
    }
  }
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: parsed.data.status,
    rationale: parsed.data.rationale ?? null,
    updated_at: now,
  };
  if (parsed.data.status === "approved") {
    patch.approved_by = admin.id;
    patch.approved_at = now;
  } else {
    patch.approved_by = null;
    patch.approved_at = null;
  }
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("competitor_equivalencies")
    .update(patch)
    .eq("id", id)
    .select("id, status, competitor_product_id, catalog_product_id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (parsed.data.invoice_line_id) {
    const { recomputeInvoiceLineComparison } = await import("@/lib/procurement/invoice-line-comparison-run");
    const { data: line } = await supabase
      .schema("gc_commerce")
      .from("invoice_lines")
      .select("uploaded_invoice_id")
      .eq("id", parsed.data.invoice_line_id)
      .maybeSingle();
    if (line) {
      const { data: inv } = await supabase
        .schema("gc_commerce")
        .from("uploaded_invoices")
        .select("company_id")
        .eq("id", (line as { uploaded_invoice_id: string }).uploaded_invoice_id)
        .maybeSingle();
      await recomputeInvoiceLineComparison(
        supabase,
        parsed.data.invoice_line_id,
        (inv as { company_id?: string | null } | null)?.company_id ?? null,
      );
    }
  }

  return NextResponse.json({ equivalency: data });
}
