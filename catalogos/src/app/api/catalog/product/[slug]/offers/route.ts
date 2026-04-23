/**
 * GET /api/catalog/product/[slug]/offers — supplier offers summary for product.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseCatalogos } from "@/lib/db/client";
import { getProductBySlug } from "@/lib/catalog/query";
import type { ProductOffersSummary } from "@/lib/catalog/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    if (!slug) return NextResponse.json({ error: "Slug required" }, { status: 400 });
    const product = await getProductBySlug(slug);
    if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const supabase = getSupabaseCatalogos(true);
    const { data: rows } = await supabase
      .from("supplier_offers")
      .select("supplier_id, supplier_sku, cost, lead_time_days")
      .eq("product_id", product.id)
      .eq("is_active", true);
    const offers = (rows ?? []).map((r: { supplier_id: string; supplier_sku: string; cost: number; lead_time_days: number | null }) => ({
      supplier_id: r.supplier_id,
      supplier_sku: r.supplier_sku,
      cost: r.cost,
      lead_time_days: r.lead_time_days,
    }));
    const costs = offers.map((o) => o.cost);
    const summary: ProductOffersSummary = {
      product_id: product.id,
      offers,
      best_price: costs.length ? Math.min(...costs) : 0,
      offer_count: offers.length,
    };
    return NextResponse.json(summary);
  } catch (e) {
    console.error("[CatalogOS] catalog offers error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Offers failed" },
      { status: 500 }
    );
  }
}
