import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import {
  lookupSkuCollisions,
  normalizeSkuCollisionQuery,
} from "@/lib/admin/sku-collision-lookup";

export const dynamic = "force-dynamic";

function parseVariantSkus(searchParams: URLSearchParams): string[] {
  const repeated = searchParams.getAll("variantSkus");
  if (repeated.length > 0) return repeated;
  const csv = searchParams.get("variantSkus");
  if (!csv) return [];
  return csv.split(",").map((s) => s.trim()).filter(Boolean);
}

function parseExcludeVariantIds(searchParams: URLSearchParams): string[] {
  const repeated = searchParams.getAll("excludeVariantIds");
  if (repeated.length > 0) return repeated;
  const csv = searchParams.get("excludeVariantIds");
  if (!csv) return [];
  return csv.split(",").map((s) => s.trim()).filter(Boolean);
}

export async function GET(request: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const searchParams = request.nextUrl.searchParams;
  const normalized = normalizeSkuCollisionQuery({
    parentSku: searchParams.get("parentSku"),
    variantSkus: parseVariantSkus(searchParams),
    excludeProductId: searchParams.get("excludeProductId"),
    excludeVariantIds: parseExcludeVariantIds(searchParams),
  });

  const result = await lookupSkuCollisions(normalized);
  return NextResponse.json(result);
}
