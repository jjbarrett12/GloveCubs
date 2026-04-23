/**
 * GET /api/catalog/recommendations — top 3 gloves for "Help me choose" answers.
 * Query: industry, toughness (light|medium|heavy), color, powder_free (true|false).
 */

import { NextRequest, NextResponse } from "next/server";
import { listLiveProducts } from "@/lib/catalog/query";
import type { StorefrontFilterParams } from "@/lib/catalog/types";
import { INDUSTRY_MAP, type IndustryKey } from "@/lib/conversion";
import { enrichCatalogItems, sortByPricePerGlove } from "@/lib/conversion";

function parseArrayParam(v: string | null): string[] {
  if (!v) return [];
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const industryKey = (searchParams.get("industry") ?? "") as IndustryKey;
    const toughness = searchParams.get("toughness") ?? "medium";
    const color = parseArrayParam(searchParams.get("color"));
    const powderFree = searchParams.get("powder_free") === "true";

    const industryValues = industryKey && INDUSTRY_MAP.get(industryKey) ? INDUSTRY_MAP.get(industryKey)!.filterValues : [];
    const params: StorefrontFilterParams = {
      category: "disposable_gloves",
      limit: 10,
      page: 1,
      sort: "price_per_glove_asc",
      industries: industryValues.length ? industryValues : undefined,
      color: color.length ? color : undefined,
      powder: powderFree ? ["powder_free"] : undefined,
    };

    if (toughness === "heavy") {
      params.thickness_mil = ["6", "7", "8", "9", "10", "11", "12"];
    } else if (toughness === "light") {
      params.thickness_mil = ["2", "3", "4"];
    }

    const payload = await listLiveProducts(params);
    const enriched = enrichCatalogItems(payload.items, industryKey && INDUSTRY_MAP.has(industryKey) ? industryKey : null);
    sortByPricePerGlove(enriched);
    const top3 = enriched.slice(0, 3).map((e) => ({
      ...e.item,
      pricePerGlove: e.pricePerGlove,
      signals: e.signals,
      industryBadge: e.industryBadge,
    }));

    return NextResponse.json({ items: top3 });
  } catch (e) {
    console.error("[CatalogOS] recommendations error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Recommendations failed" },
      { status: 500 }
    );
  }
}
