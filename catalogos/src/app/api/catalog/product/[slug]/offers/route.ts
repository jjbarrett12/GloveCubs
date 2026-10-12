/**
 * GET /api/catalog/product/[slug]/offers — public supplier offer summary.
 * Never includes supplier cost.
 */

import { NextRequest, NextResponse } from "next/server";
import { getProductBySlug } from "@/lib/catalog/query";
import { toPublicOffersSummary } from "@/lib/catalog/public-offers";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    if (!slug) return NextResponse.json({ error: "Slug required" }, { status: 400 });
    const product = await getProductBySlug(slug);
    if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const summary = await toPublicOffersSummary(product.id);
    return NextResponse.json(summary);
  } catch (e) {
    console.error("[CatalogOS] catalog offers error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Offers failed" },
      { status: 500 }
    );
  }
}
