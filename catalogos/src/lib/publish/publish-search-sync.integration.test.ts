/**
 * Integration: catalogos.products + CatalogOS listing search (listLiveProducts).
 * Requires Supabase. Skips when env not configured.
 */
import { describe, it, expect } from "vitest";
import { getSupabaseCatalogos } from "@/lib/db/client";
import { isProductLiveInCatalogos } from "./canonical-sync-service";
import { listLiveProducts } from "@/lib/catalog/query";

const hasSupabase =
  !!(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.runIf(hasSupabase)("publish / search sync (live DB)", () => {
  it("active catalogos product is findable via listLiveProducts (storefront search path)", async () => {
    const catalogos = getSupabaseCatalogos(true);

    const { data: p, error: pErr } = await catalogos
      .from("products")
      .select("id, sku, name")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (pErr || !p?.id || !p.sku) {
      throw new Error("No active catalogos.products row to test (or query error).");
    }

    const productId = p.id as string;
    const sku = String(p.sku);

    const live = await isProductLiveInCatalogos(catalogos, productId);
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
