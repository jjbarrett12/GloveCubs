import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { fetchCompanyQuicklistItems, searchQuicklistCatalogVariants } from "@/lib/admin/admin-company-quicklist";

function uuidParam(id: string | undefined): string | null {
  if (!id || !z.string().uuid().safeParse(id).success) return null;
  return id;
}

export async function GET(request: NextRequest, ctx: { params: { companyId: string } }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const companyId = uuidParam(ctx.params.companyId);
  if (!companyId) return NextResponse.json({ error: "Invalid company id" }, { status: 400 });

  const supabase = getSupabaseAdmin() as any;
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (q) {
    const { rows, error } = await searchQuicklistCatalogVariants(supabase, q);
    if (error) return NextResponse.json({ error }, { status: 500 });
    return NextResponse.json({ variants: rows });
  }

  const { rows, error } = await fetchCompanyQuicklistItems(supabase, companyId);
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ items: rows });
}

const postSchema = z.object({
  catalog_product_id: z.string().uuid(),
  catalog_variant_id: z.string().uuid(),
  admin_note: z.string().trim().max(2000).optional().nullable(),
  sort_order: z.number().int().min(0).max(1_000_000).optional(),
});

export async function POST(request: NextRequest, ctx: { params: { companyId: string } }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const companyId = uuidParam(ctx.params.companyId);
  if (!companyId) return NextResponse.json({ error: "Invalid company id" }, { status: 400 });

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

  const { catalog_product_id, catalog_variant_id, admin_note, sort_order } = parsed.data;
  const supabase = getSupabaseAdmin() as any;

  const { data: co, error: coErr } = await supabase
    .schema("gc_commerce")
    .from("companies")
    .select("id")
    .eq("id", companyId)
    .maybeSingle();
  if (coErr || !co) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const { data: variant, error: vErr } = await supabase
    .schema("catalog_v2")
    .from("catalog_variants")
    .select("id, catalog_product_id, is_active")
    .eq("id", catalog_variant_id)
    .maybeSingle();

  if (vErr || !variant) {
    return NextResponse.json({ error: "Variant not found" }, { status: 400 });
  }

  const vr = variant as {
    id: string;
    catalog_product_id: string;
    is_active: boolean;
  };

  if (vr.catalog_product_id !== catalog_product_id) {
    return NextResponse.json({ error: "Variant does not belong to the given product" }, { status: 400 });
  }

  const { data: product, error: pErr } = await supabase
    .schema("catalog_v2")
    .from("catalog_products")
    .select("id, status")
    .eq("id", catalog_product_id)
    .maybeSingle();

  if (pErr || !product) {
    return NextResponse.json({ error: "Product not found" }, { status: 400 });
  }

  const pr = product as { id: string; status: string };

  if (pr.status !== "active" || !vr.is_active) {
    return NextResponse.json({ error: "Only active products and active variants can be added" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { data: inserted, error: insErr } = await supabase
    .schema("gc_commerce")
    .from("company_quicklist_items")
    .insert({
      company_id: companyId,
      catalog_product_id,
      catalog_variant_id,
      sort_order: sort_order ?? 0,
      admin_note: admin_note?.trim() || null,
      created_by_user_id: admin.id,
      created_at: now,
      updated_at: now,
    })
    .select("id, company_id, catalog_product_id, catalog_variant_id, sort_order, admin_note, created_at, updated_at")
    .single();

  if (insErr) {
    if (insErr.code === "23505" || /duplicate|unique/i.test(insErr.message ?? "")) {
      return NextResponse.json({ error: "This variant is already on the customer quicklist" }, { status: 409 });
    }
    if (String(insErr.message ?? "").includes("quicklist_variant_product_mismatch")) {
      return NextResponse.json({ error: "Variant and product mismatch" }, { status: 400 });
    }
    console.error("[POST quicklist-items]", insErr);
    return NextResponse.json({ error: insErr.message || "Insert failed" }, { status: 500 });
  }

  return NextResponse.json({ item: inserted }, { status: 201 });
}
