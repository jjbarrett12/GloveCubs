/**
 * GET /api/catalog/product/[slug] — product detail by slug.
 */

import { NextRequest, NextResponse } from "next/server";
import { getProductBySlug } from "@/lib/catalog/query";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    if (!slug) return NextResponse.json({ error: "Slug required" }, { status: 400 });
    const product = await getProductBySlug(slug);
    if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(product);
  } catch (e) {
    console.error("[CatalogOS] catalog product error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Fetch failed" },
      { status: 500 }
    );
  }
}
