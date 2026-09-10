import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { upsertCompetitorAlias } from "@/lib/procurement/competitor-write";
import { recomputeInvoiceLineComparison } from "@/lib/procurement/invoice-line-comparison-run";
import { sanitizeIlikeQuery } from "@/lib/admin/sanitize-ilike-query";

const postSchema = z.object({
  manufacturer: z.string().max(200).optional().nullable(),
  brand: z.string().max(200).optional().nullable(),
  sku: z.string().max(200).optional().nullable(),
  upc_gtin: z.string().max(32).optional().nullable(),
  product_name: z.string().max(500).optional().nullable(),
  material: z.string().max(80).optional().nullable(),
  thickness_mil: z.number().positive().optional().nullable(),
  color: z.string().max(80).optional().nullable(),
  size: z.string().max(40).optional().nullable(),
  grade: z.string().max(80).optional().nullable(),
  powder: z.string().max(80).optional().nullable(),
  texture: z.string().max(80).optional().nullable(),
  cuff: z.string().max(80).optional().nullable(),
  aql: z.string().max(40).optional().nullable(),
  certifications: z.array(z.string().max(80)).optional(),
  gloves_per_box: z.number().positive().optional().nullable(),
  boxes_per_case: z.number().positive().optional().nullable(),
  gloves_per_case: z.number().positive().optional().nullable(),
  quantity_uom: z.enum(["EA", "BX", "CS"]).optional().nullable(),
  invoice_line_id: z.string().uuid().optional(),
  invoice_description: z.string().max(4000).optional().nullable(),
});

export async function GET(request: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = sanitizeIlikeQuery(request.nextUrl.searchParams.get("q") ?? "");
  const supabase = getSupabaseAdmin() as any;
  let query = supabase
    .schema("gc_commerce")
    .from("competitor_products")
    .select("id, manufacturer, brand, sku, upc_gtin, product_name, material, grade, thickness_mil, updated_at")
    .order("updated_at", { ascending: false })
    .limit(50);
  if (q.length >= 2) {
    const pattern = `%${q}%`;
    query = query.or(`sku.ilike.${pattern},product_name.ilike.${pattern},manufacturer.ilike.${pattern}`);
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ products: data ?? [] });
}

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
  const d = parsed.data;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("competitor_products")
    .insert({
      manufacturer: d.manufacturer ?? null,
      brand: d.brand ?? null,
      sku: d.sku ?? null,
      upc_gtin: d.upc_gtin ?? null,
      product_name: d.product_name ?? null,
      material: d.material ?? null,
      thickness_mil: d.thickness_mil ?? null,
      color: d.color ?? null,
      size: d.size ?? null,
      grade: d.grade ?? null,
      powder: d.powder ?? null,
      texture: d.texture ?? null,
      cuff: d.cuff ?? null,
      aql: d.aql ?? null,
      certifications: d.certifications ?? [],
      gloves_per_box: d.gloves_per_box ?? null,
      boxes_per_case: d.boxes_per_case ?? null,
      gloves_per_case: d.gloves_per_case ?? null,
      quantity_uom: d.quantity_uom ?? null,
      updated_at: now,
    })
    .select("id")
    .single();
  if (error || !data?.id) {
    return NextResponse.json({ error: error?.message ?? "insert_failed" }, { status: 500 });
  }
  const competitorId = String(data.id);
  if (d.sku?.trim()) {
    const a = await upsertCompetitorAlias(supabase, {
      competitor_product_id: competitorId,
      alias_type: "sku",
      raw_value: d.sku,
      source: "operator",
    });
    if (!a.ok) return NextResponse.json({ error: a.error }, { status: 500 });
  }
  if (d.upc_gtin?.trim()) {
    const a = await upsertCompetitorAlias(supabase, {
      competitor_product_id: competitorId,
      alias_type: "upc",
      raw_value: d.upc_gtin,
      source: "operator",
    });
    if (!a.ok) return NextResponse.json({ error: a.error }, { status: 500 });
  }
  if (d.invoice_description?.trim()) {
    const a = await upsertCompetitorAlias(supabase, {
      competitor_product_id: competitorId,
      alias_type: "invoice_description",
      raw_value: d.invoice_description,
      source: "operator",
    });
    if (!a.ok) return NextResponse.json({ error: a.error }, { status: 500 });
  }

  let comparison = null;
  if (d.invoice_line_id) {
    const { data: line } = await supabase
      .schema("gc_commerce")
      .from("invoice_lines")
      .select("id, uploaded_invoice_id, supplier_sku, manufacturer_sku, raw_description")
      .eq("id", d.invoice_line_id)
      .maybeSingle();
    if (line) {
      await supabase
        .schema("gc_commerce")
        .from("invoice_lines")
        .update({ competitor_product_id: competitorId, updated_at: now })
        .eq("id", d.invoice_line_id);
      const sku = (line as { supplier_sku?: string | null }).supplier_sku ?? d.sku;
      if (sku?.trim()) {
        await upsertCompetitorAlias(supabase, {
          competitor_product_id: competitorId,
          alias_type: "sku",
          raw_value: sku,
          source: "operator",
        });
      }
      const mfr = (line as { manufacturer_sku?: string | null }).manufacturer_sku;
      if (mfr?.trim()) {
        await upsertCompetitorAlias(supabase, {
          competitor_product_id: competitorId,
          alias_type: "manufacturer_sku",
          raw_value: mfr,
          source: "operator",
        });
      }
      const desc = (line as { raw_description?: string | null }).raw_description ?? d.invoice_description;
      if (desc?.trim()) {
        await upsertCompetitorAlias(supabase, {
          competitor_product_id: competitorId,
          alias_type: "invoice_description",
          raw_value: desc,
          source: "operator",
        });
      }
      const { data: inv } = await supabase
        .schema("gc_commerce")
        .from("uploaded_invoices")
        .select("company_id")
        .eq("id", (line as { uploaded_invoice_id: string }).uploaded_invoice_id)
        .maybeSingle();
      comparison = await recomputeInvoiceLineComparison(
        supabase,
        d.invoice_line_id,
        (inv as { company_id?: string | null } | null)?.company_id ?? null,
      );
    }
  }

  return NextResponse.json({ competitor_product_id: competitorId, comparison });
}
