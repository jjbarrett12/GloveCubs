/**
 * GET /api/catalog/facets — facet counts + dictionary definitions (display_group, sort_order).
 * Same query params as /api/catalog/products (filters). Returns counts per attribute value and facet metadata.
 */

import { NextRequest, NextResponse } from "next/server";
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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const params = normalizeStorefrontFilterParams({
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
    });
    const categorySlug = params.category ?? DEFAULT_PRODUCT_TYPE_KEY;
    const categoryId = await getCategoryIdBySlug(categorySlug);
    const [facets, price_bounds, facetDefs] = await Promise.all([
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
    return NextResponse.json({ facets, price_bounds, facet_definitions });
  } catch (e) {
    console.error("[CatalogOS] catalog facets error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Facets failed" },
      { status: 500 }
    );
  }
}
