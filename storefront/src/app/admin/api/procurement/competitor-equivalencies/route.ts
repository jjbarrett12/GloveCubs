import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { assertActiveCatalogProductExists } from "@/lib/catalog/assert-catalog-product-exists";

const postSchema = z.object({
  competitor_product_id: z.string().uuid(),
  catalog_product_id: z.string().uuid(),
  catalog_variant_id: z.string().uuid().optional().nullable(),
  spec_group_id: z.string().uuid().optional().nullable(),
  invoice_line_id: z.string().uuid().optional(),
  rationale: z.string().max(2000).optional().nullable(),
  evidence: z.record(z.unknown()).optional(),
});

/** Create a candidate/needs_review equivalency. Never accepted as approved. */
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
  const active = await assertActiveCatalogProductExists(supabase, parsed.data.catalog_product_id);
  if (!active) {
    return NextResponse.json({ error: "invalid_or_inactive_catalog_product_id" }, { status: 400 });
  }
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("competitor_equivalencies")
    .insert({
      competitor_product_id: parsed.data.competitor_product_id,
      catalog_product_id: parsed.data.catalog_product_id,
      catalog_variant_id: parsed.data.catalog_variant_id ?? null,
      spec_group_id: parsed.data.spec_group_id ?? null,
      status: "candidate",
      rationale: parsed.data.rationale ?? null,
      evidence: parsed.data.evidence ?? {},
      updated_at: now,
    })
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
