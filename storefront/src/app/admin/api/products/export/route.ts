import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function csvEscape(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const supabase = getSupabaseAdmin() as any;
  const { data: products, error } = await supabase
    .schema("catalog_v2")
    .from("catalog_products")
    .select("id, name, slug, status, internal_sku, brand_id, updated_at")
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(5000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (products ?? []) as Array<{
    id: string;
    name: string;
    slug: string;
    status: string;
    internal_sku: string | null;
    brand_id: string | null;
    updated_at: string | null;
  }>;

  const brandIds = Array.from(new Set(rows.map((r) => r.brand_id).filter(Boolean))) as string[];
  const brandMap = new Map<string, string>();
  if (brandIds.length) {
    const { data: brands } = await supabase.schema("catalogos").from("brands").select("id, name").in("id", brandIds);
    for (const b of brands ?? []) {
      brandMap.set((b as { id: string }).id, (b as { name: string }).name);
    }
  }

  const header = ["id", "name", "slug", "status", "internal_sku", "brand_id", "brand_name", "updated_at"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.id),
        csvEscape(r.name ?? ""),
        csvEscape(r.slug ?? ""),
        csvEscape(r.status ?? ""),
        csvEscape(r.internal_sku ?? ""),
        csvEscape(r.brand_id ?? ""),
        csvEscape(r.brand_id ? brandMap.get(r.brand_id) ?? "" : ""),
        csvEscape(r.updated_at ?? ""),
      ].join(",")
    );
  }

  const body = lines.join("\r\n");
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="glovecubs-catalog-products.csv"',
    },
  });
}
