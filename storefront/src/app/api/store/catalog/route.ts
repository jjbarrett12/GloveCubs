import { NextResponse } from "next/server";
import { fetchStoreCatalogPage } from "@/lib/catalog/store-products";
import { parseStoreCatalogParams } from "@/lib/catalog/store-url";

/**
 * Anonymous catalog JSON for client-side /store filter hydration.
 * Response is CDN-cacheable by full query URL (s-maxage) so repeated filter
 * variants do not require fresh origin work on every hit.
 */
function searchParamsToRecord(sp: URLSearchParams): Record<string, string | string[] | undefined> {
  const out: Record<string, string | string[] | undefined> = {};
  for (const key of Array.from(new Set(Array.from(sp.keys())))) {
    const all = sp.getAll(key);
    out[key] = all.length <= 1 ? (all[0] ?? undefined) : all;
  }
  return out;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const urlState = parseStoreCatalogParams(searchParamsToRecord(url.searchParams));
  const page = await fetchStoreCatalogPage(urlState);

  return NextResponse.json(
    {
      products: page.products,
      total: page.total,
      page: page.page,
      limit: page.limit,
      brands: page.brands,
      facetCounts: page.facetCounts,
      facetMeta: page.facetMeta,
      catalogUnavailable: Boolean(page.catalogUnavailable),
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    },
  );
}
