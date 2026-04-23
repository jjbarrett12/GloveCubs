/**
 * GET /api/catalog/products — list live products with filters, pagination, sort.
 * Query params: category, material, size, color, brand, price_min, price_max, q, sort, page, limit.
 * Arrays: material, size, color, etc. as comma-separated (e.g. material=nitrile,latex).
 */

import { NextRequest, NextResponse } from "next/server";
import { listLiveProducts } from "@/lib/catalog/query";
import type { StorefrontFilterParams } from "@/lib/catalog/types";

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
    const params: StorefrontFilterParams = {
      category: searchParams.get("category") ?? undefined,
      material: parseArrayParam(searchParams.get("material")),
      size: parseArrayParam(searchParams.get("size")),
      color: parseArrayParam(searchParams.get("color")),
      brand: parseArrayParam(searchParams.get("brand")),
      thickness_mil: parseArrayParam(searchParams.get("thickness_mil")),
      powder: parseArrayParam(searchParams.get("powder")),
      grade: parseArrayParam(searchParams.get("grade")),
      industries: parseArrayParam(searchParams.get("industries")),
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
    };
    const payload = await listLiveProducts(params);
    return NextResponse.json(payload);
  } catch (e) {
    console.error("[CatalogOS] catalog products error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "List failed" },
      { status: 500 }
    );
  }
}
