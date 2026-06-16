import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { catalogBestOfferPriceQuery } from "@/lib/catalog/store-best-offer-price-query";

const STORE_PRODUCTS = readFileSync(join(__dirname, "store-products.ts"), "utf8");
const STORE_PRODUCT_DETAIL = readFileSync(join(__dirname, "store-product-detail.ts"), "utf8");

describe("catalogBestOfferPriceQuery", () => {
  it("reads catalogos.product_best_offer_price", () => {
    const calls: string[] = [];
    const supabase = {
      schema: (name: string) => {
        calls.push(name);
        return {
          from: (table: string) => ({ schema: name, table }),
        };
      },
    };
    const q = catalogBestOfferPriceQuery(supabase);
    expect(calls).toEqual(["catalogos"]);
    expect(q).toMatchObject({ schema: "catalogos", table: "product_best_offer_price" });
  });
});

describe("store listing best-offer price read model", () => {
  it("store-products routes filter/sort/hydration through catalogBestOfferPriceQuery", () => {
    expect(STORE_PRODUCTS).not.toMatch(/[^.]from\("product_best_offer_price"\)/);
    expect(STORE_PRODUCTS).toContain("catalogBestOfferPriceQuery");
    expect(STORE_PRODUCTS).toContain("applyPriceBoundsToIds");
    expect(STORE_PRODUCTS).toContain('"price_asc"');
    expect(STORE_PRODUCTS).toContain('"price_desc"');
  });

  it("store-product-detail uses catalogBestOfferPriceQuery for PDP bestPrice", () => {
    expect(STORE_PRODUCT_DETAIL).not.toMatch(/[^.]from\("product_best_offer_price"\)/);
    expect(STORE_PRODUCT_DETAIL).toContain("catalogBestOfferPriceQuery");
  });

  it("listing still falls back to commerce metadata for display when offer row missing", () => {
    expect(STORE_PRODUCTS).toContain("commerceDisplayFromProductMetadata");
    expect(STORE_PRODUCTS).toContain("validDisplayPrice");
  });
});
