/**
 * Integration: catalogos.products + searchProducts (storefront API data path).
 * Skips when NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are unset.
 */
import { describe, it, expect } from "vitest";
import { getSupabaseCatalogos, supabaseAdmin } from "../jobs/supabase";
import { searchProducts } from "./productSearch";

const hasSupabase =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.runIf(hasSupabase)("publish → storefront search (live DB)", () => {
  it("searchProducts returns the listing id for an active catalog SKU (resolve_canonical_listing_product_id)", async () => {
    const catalogos = getSupabaseCatalogos();
    const { data: list, error } = await catalogos
      .from("products")
      .select("id, sku")
      .eq("is_active", true)
      .not("sku", "is", null)
      .limit(25);

    if (error) throw new Error(error.message);
    const p = (list ?? []).find((row: { sku?: string }) => String(row.sku ?? "").trim().length >= 2);
    if (!p?.id || !p.sku) {
      throw new Error("No active catalogos.products row with sku (length ≥2) for integration test.");
    }

    const sku = String(p.sku).trim();
    const res = await searchProducts(sku, { limit: 40 });

    const { data: listingIdRaw, error: rpcErr } = await supabaseAdmin.rpc("resolve_canonical_listing_product_id", {
      p_id: p.id,
    });
    if (rpcErr) throw new Error(rpcErr.message);
    const expectedListingId =
      listingIdRaw != null && listingIdRaw !== "" ? String(listingIdRaw) : String(p.id);

    const hit = res.results.find((r) => r.product_id === expectedListingId);
    expect(hit).toBeDefined();
  });
});
