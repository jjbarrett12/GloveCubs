/**
 * Integration: catalog_v2.catalog_products + CatalogOS listing search (listLiveProducts).
 * Requires Supabase. Skips when env not configured.
 */
import { describe, it, expect } from "vitest";
import { getSupabase } from "@/lib/db/client";
import { isCatalogV2ProductActive } from "./canonical-sync-service";
import { listLiveProducts } from "@/lib/catalog/query";

const hasSupabase =
  !!(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.runIf(hasSupabase)("publish / search sync (live DB)", () => {
  it("active catalog_v2 product is findable via listLiveProducts (storefront search path)", async () => {
    const admin = getSupabase(true);

    const { data: p, error: pErr } = await admin
      .schema("catalog_v2")
      .from("catalog_products")
      .select("id, internal_sku, name")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (pErr || !p?.id || !p.internal_sku) {
      throw new Error("No active catalog_v2.catalog_products row to test (or query error).");
    }

    const productId = p.id as string;
    const sku = String(p.internal_sku);

    const live = await isCatalogV2ProductActive(productId);
    expect(live).toBe(true);

    const listing = await listLiveProducts({
      q: sku,
      page: 1,
      limit: 48,
      sort: "newest",
    });
    const found = listing.items.some((item) => item.id === productId);
    expect(found).toBe(true);
  });
});
