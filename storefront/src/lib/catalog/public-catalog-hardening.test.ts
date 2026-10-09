import { describe, expect, it } from "vitest";
import { filterPublicCatalogClient } from "./filter-public-catalog-client";
import type { StoreProductRow } from "./store-products";
import { parseStoreCatalogParams, buildStoreCatalogHref } from "./store-url";
import { buildCatalogSearchString } from "./store-params";

function product(partial: Partial<StoreProductRow> & { id: string; name: string; slug: string }): StoreProductRow {
  return {
    brandName: null,
    brandId: null,
    imageUrl: null,
    internalSku: null,
    catalogVariantId: null,
    variantSku: null,
    sizeCode: null,
    materialHint: null,
    badges: [],
    bestPrice: null,
    casePrice: null,
    caseListPrice: null,
    caseOnSale: false,
    palletPrice: null,
    palletListPrice: null,
    palletOnSale: false,
    unitsPerCase: null,
    unitNoun: "gloves",
    palletPricingAvailable: false,
    caseLabel: null,
    palletLabel: null,
    commercialUseSummary: null,
    certificationHints: [],
    protectionHint: null,
    activeVariantCount: 1,
    availableSizeCodes: [],
    description: null,
    impactPerformance: null,
    ...partial,
  };
}

describe("public catalog query cardinality / client filter", () => {
  it("equivalent filter states produce the same canonical store href (stable order, omit defaults)", () => {
    const a = buildStoreCatalogHref({
      category: "nitrile",
      sort: "price_asc",
      page: 1,
      q: "",
      brand: ["b1"],
    });
    const b = buildStoreCatalogHref({
      brand: ["b1"],
      sort: "price_asc",
      category: "nitrile",
    });
    expect(a).toBe(b);
    expect(a).not.toContain("page=");
    expect(a).not.toContain("q=");
  });

  it("unknown query params are dropped by parseStoreCatalogParams (no semantic variants)", () => {
    const state = parseStoreCatalogParams({
      category: "nitrile",
      foo: "1",
      utm_campaign: "random",
      sort: "price_asc",
    });
    expect(buildCatalogSearchString(state)).not.toContain("foo");
    expect(buildCatalogSearchString(state)).not.toContain("utm_");
    expect(state.category).toBe("nitrile");
    expect(state.sort).toBe("price_asc");
  });

  it("blank search and default page/sort omit from href", () => {
    const href = buildStoreCatalogHref({ q: "  ", page: 1, sort: "newest", limit: 24 });
    expect(href).toBe("/store");
  });

  it("client filter applies q/brand/sort/page locally without needing API query params", () => {
    const dataset = {
      products: [
        product({ id: "1", name: "Alpha Nitrile", slug: "a", brandId: "b1", brandName: "Acme", bestPrice: 20 }),
        product({ id: "2", name: "Beta Vinyl", slug: "b", brandId: "b2", brandName: "BetaCo", bestPrice: 10 }),
        product({ id: "3", name: "Gamma Nitrile", slug: "c", brandId: "b1", brandName: "Acme", bestPrice: 15 }),
      ],
      total: 3,
      limit: 24,
      brands: [],
      facetCounts: {},
      facetMeta: {},
    };

    const filtered = filterPublicCatalogClient(
      dataset,
      parseStoreCatalogParams({ q: "nitrile", brand: "b1", sort: "price_asc" }),
    );
    expect(filtered.products.map((p) => p.id)).toEqual(["3", "1"]);
    expect(filtered.total).toBe(2);
  });

  it("unavailable dataset stays empty under any filter state", () => {
    const out = filterPublicCatalogClient(
      {
        products: [product({ id: "1", name: "X", slug: "x" })],
        total: 1,
        limit: 24,
        brands: [],
        facetCounts: {},
        facetMeta: {},
        catalogUnavailable: true,
      },
      parseStoreCatalogParams({ q: "x" }),
    );
    expect(out.products).toEqual([]);
    expect(out.catalogUnavailable).toBe(true);
  });
});
