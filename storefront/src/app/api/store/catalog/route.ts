/**
 * Canonical public catalog JSON — one cache key, no crawler-controlled query variants.
 *
 * Intentionally does NOT read `Request` / searchParams: doing so forced dynamic
 * serverless execution and prevented Vercel CDN from honoring s-maxage (live MISS churn).
 */
import { NextResponse } from "next/server";
import { getPublicAnonymousCatalogDataset } from "@/lib/catalog/public-catalog-dataset";

export const dynamic = "force-static";
export const revalidate = 300;

export async function GET() {
  const dataset = await getPublicAnonymousCatalogDataset();

  return NextResponse.json(
    {
      products: dataset.products,
      total: dataset.total,
      limit: dataset.limit,
      brands: dataset.brands,
      facetCounts: dataset.facetCounts,
      facetMeta: dataset.facetMeta,
      catalogUnavailable: dataset.catalogUnavailable,
      /** Snapshot metadata for clients — not a cache-buster. */
      generatedAt: dataset.generatedAt,
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        // Stable Vary — do not vary on query string / cookies.
        Vary: "Accept-Encoding",
      },
    },
  );
}
