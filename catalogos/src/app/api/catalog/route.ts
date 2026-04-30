/**
 * GET /api/catalog — full storefront filter UI contract.
 * Returns: products, selected_filters, available_facets, price_bounds, pagination [, facet_definitions].
 * Same query params as /api/catalog/products and /api/catalog/facets.
 */

import { NextRequest, NextResponse } from "next/server";
import { listLiveProducts } from "@/lib/catalog/query";
import { getFacetCounts, getPriceBounds } from "@/lib/catalog/facets";
import { getCategoryIdBySlug, loadFacetDefinitionsForCategory } from "@/lib/catalogos/dictionary-service";
import { normalizeStorefrontFilterParams } from "@/lib/catalog/params";
import type { StorefrontFilterParams } from "@/lib/catalog/types";
import { DEFAULT_PRODUCT_TYPE_KEY } from "@/lib/product-types";

function parseArrayParam(v: string | null): string[] {
  if (!v) return [];
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

function parseNum(v: string | null): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function paramsFromRequest(req: NextRequest): StorefrontFilterParams {
  const { searchParams } = new URL(req.url);
  return normalizeStorefrontFilterParams({
    category: searchParams.get("category") ?? undefined,
    material: parseArrayParam(searchParams.get("material")),
    size: parseArrayParam(searchParams.get("size")),
    color: parseArrayParam(searchParams.get("color")),
    brand: parseArrayParam(searchParams.get("brand")),
    thickness_mil: parseArrayParam(searchParams.get("thickness_mil")),
    powder: parseArrayParam(searchParams.get("powder")),
    grade: parseArrayParam(searchParams.get("grade")),
    industries: parseArrayParam(searchParams.get("industries")),
    certifications: parseArrayParam(searchParams.get("certifications")),
    uses: parseArrayParam(searchParams.get("uses")),
    protection_tags: parseArrayParam(searchParams.get("protection_tags")),
    compliance_certifications: parseArrayParam(searchParams.get("compliance_certifications")),
    texture: parseArrayParam(searchParams.get("texture")),
    cuff_style: parseArrayParam(searchParams.get("cuff_style")),
    hand_orientation: parseArrayParam(searchParams.get("hand_orientation")),
    packaging: parseArrayParam(searchParams.get("packaging")),
    sterility: parseArrayParam(searchParams.get("sterility")),
    cut_level_ansi: parseArrayParam(searchParams.get("cut_level_ansi")),
    puncture_level: parseArrayParam(searchParams.get("puncture_level")),
    abrasion_level: parseArrayParam(searchParams.get("abrasion_level")),
    flame_resistant: parseArrayParam(searchParams.get("flame_resistant")),
    arc_rating: parseArrayParam(searchParams.get("arc_rating")),
    warm_cold_weather: parseArrayParam(searchParams.get("warm_cold_weather")),
    price_min: parseNum(searchParams.get("price_min")),
    price_max: parseNum(searchParams.get("price_max")),
    q: searchParams.get("q") ?? undefined,
    sort: (searchParams.get("sort") as StorefrontFilterParams["sort"]) ?? "newest",
    page: parseNum(searchParams.get("page")) ?? 1,
    limit: parseNum(searchParams.get("limit")) ?? 24,
  });
}

export async function GET(req: NextRequest) {
  try {
    const params = paramsFromRequest(req);
    const categorySlug = params.category ?? DEFAULT_PRODUCT_TYPE_KEY;
    const categoryId = await getCategoryIdBySlug(categorySlug);

    const [products, facets, price_bounds, facetDefs] = await Promise.all([
      listLiveProducts(params),
      getFacetCounts(params),
      getPriceBounds(params),
      categoryId ? loadFacetDefinitionsForCategory(categoryId) : Promise.resolve([]),
    ]);

    const facet_definitions = facetDefs.map((d) => ({
      attribute_key: d.attribute_key,
      label: d.label,
      display_group: d.display_group,
      sort_order: d.sort_order,
      cardinality: d.cardinality,
    }));

    const payload = {
      products,
      selected_filters: params,
      available_facets: facets,
      price_bounds,
      facet_definitions,
      pagination: {
        page: products.page,
        limit: products.limit,
        total: products.total,
        total_pages: products.total_pages,
      },
    };
    return NextResponse.json(payload);
  } catch (e) {
    console.error("[CatalogOS] catalog combined error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Catalog failed" },
      { status: 500 }
    );
  }
}
