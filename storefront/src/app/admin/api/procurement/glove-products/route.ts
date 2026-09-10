import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { sanitizeIlikeQuery } from "@/lib/admin/sanitize-ilike-query";

/** Operator search for proposing a GloveCubs equivalent. Active products only. */
export async function GET(request: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = sanitizeIlikeQuery(request.nextUrl.searchParams.get("q") ?? "");
  if (q.length < 2) return NextResponse.json({ products: [] });
  const supabase = getSupabaseAdmin() as any;
  const pattern = `%${q}%`;
  const { data, error } = await supabase
    .schema("catalog_v2")
    .from("catalog_products")
    .select("id, name, slug, status, internal_sku")
    .eq("status", "active")
    .or(`name.ilike.${pattern},slug.ilike.${pattern},internal_sku.ilike.${pattern}`)
    .limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const products = (data ?? []) as Array<{ id: string; name: string; slug: string; status: string; internal_sku: string | null }>;
  const ids = products.map((p) => p.id);
  let sizes: Array<{ catalog_product_id: string; size_code: string | null }> = [];
  if (ids.length) {
    const { data: variants } = await supabase
      .schema("catalog_v2")
      .from("catalog_variants")
      .select("catalog_product_id, size_code")
      .in("catalog_product_id", ids)
      .eq("is_active", true)
      .limit(400);
    sizes = (variants ?? []) as Array<{ catalog_product_id: string; size_code: string | null }>;
  }
  return NextResponse.json({
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      sku: p.internal_sku,
      sizes: sizes.filter((s) => s.catalog_product_id === p.id).map((s) => s.size_code).filter(Boolean),
    })),
  });
}
