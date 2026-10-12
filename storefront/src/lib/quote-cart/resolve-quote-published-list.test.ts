import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { PdpVariantPricingRow } from "@/lib/pricing/variant-pricing-contracts";
import {
  formatQuoteRequestEmailPriceLabel,
  quotePublishedListLookupQueryCount,
  resolveQuoteLinePublishedList,
  resolveQuoteRequestPublishedListPrices,
  snapshotClientPriceAudit,
  QUOTE_REQUEST_PRICING,
} from "@/lib/quote-cart/resolve-quote-published-list";

const PRODUCT_ID = "550e8400-e29b-41d4-a716-446655440001";
const OTHER_PRODUCT = "550e8400-e29b-41d4-a716-446655440099";
const small = "22222222-2222-4211-8222-222222222222";
const medium = "33333333-3333-4311-8333-333333333333";

function row(id: string, list: number | null, productId = PRODUCT_ID): PdpVariantPricingRow {
  return {
    catalogVariantId: id,
    catalogProductId: productId,
    listUnitPriceMajor: list,
    offerCount: list != null ? 1 : 0,
    pricingSource: list != null ? "catalogos.supplier_offers.variant_fk_sell_v1" : "unavailable",
    currencyCode: "USD",
  };
}

describe("resolveQuoteLinePublishedList", () => {
  it("mapped variant list 85 persists 85", () => {
    expect(
      resolveQuoteLinePublishedList({
        catalogVariantId: small,
        productId: PRODUCT_ID,
        pricingRow: row(small, 85),
        productStatus: "active",
      })
    ).toEqual({ unit_price_major: 85, pricing_status: "variant_published_list" });
  });

  it("client stale 85 vs server 92 → 92", () => {
    expect(
      resolveQuoteLinePublishedList({
        catalogVariantId: small,
        productId: PRODUCT_ID,
        pricingRow: row(small, 92),
        productStatus: "active",
      }).unit_price_major
    ).toBe(92);
  });

  it("unmapped variant → request pricing despite family-min or client 85", () => {
    expect(
      resolveQuoteLinePublishedList({
        catalogVariantId: medium,
        productId: PRODUCT_ID,
        pricingRow: undefined,
        productStatus: "active",
      })
    ).toEqual(QUOTE_REQUEST_PRICING);
  });

  it("does not inherit a sibling size price", () => {
    expect(
      resolveQuoteLinePublishedList({
        catalogVariantId: medium,
        productId: PRODUCT_ID,
        pricingRow: row(small, 85),
        productStatus: "active",
      })
    ).toEqual(QUOTE_REQUEST_PRICING);
  });

  it("missing variant id → request pricing (no product/slug/size guess)", () => {
    expect(
      resolveQuoteLinePublishedList({
        catalogVariantId: null,
        productId: PRODUCT_ID,
        pricingRow: row(small, 85),
        productStatus: "active",
      })
    ).toEqual(QUOTE_REQUEST_PRICING);
  });

  it("product_id mismatch does not attach another product's list", () => {
    expect(
      resolveQuoteLinePublishedList({
        catalogVariantId: small,
        productId: OTHER_PRODUCT,
        pricingRow: row(small, 85),
        productStatus: "active",
      })
    ).toEqual(QUOTE_REQUEST_PRICING);
  });

  it("inactive product is not a current published list", () => {
    expect(
      resolveQuoteLinePublishedList({
        catalogVariantId: small,
        productId: PRODUCT_ID,
        pricingRow: row(small, 85),
        productStatus: "inactive",
      })
    ).toEqual(QUOTE_REQUEST_PRICING);
  });

  it("pallet sell unit is request pricing (case list is not pallet authority)", () => {
    expect(
      resolveQuoteLinePublishedList({
        sellUnit: "pallet",
        catalogVariantId: small,
        productId: PRODUCT_ID,
        pricingRow: row(small, 85),
        productStatus: "active",
      })
    ).toEqual(QUOTE_REQUEST_PRICING);
  });

  it("zero or null list is request pricing, not a fake zero", () => {
    expect(
      resolveQuoteLinePublishedList({
        catalogVariantId: small,
        productId: PRODUCT_ID,
        pricingRow: row(small, null),
        productStatus: "active",
      })
    ).toEqual(QUOTE_REQUEST_PRICING);
  });
});

describe("formatQuoteRequestEmailPriceLabel", () => {
  it("labels only verified list as published list", () => {
    expect(formatQuoteRequestEmailPriceLabel(85)).toBe("published list 85");
    expect(formatQuoteRequestEmailPriceLabel(null)).toBe("request pricing");
    expect(formatQuoteRequestEmailPriceLabel(0)).toBe("request pricing");
    expect(formatQuoteRequestEmailPriceLabel(1)).toBe("published list 1");
  });
});

describe("snapshotClientPriceAudit", () => {
  it("records mismatched client display price without making it authoritative", () => {
    expect(
      snapshotClientPriceAudit(1, { unit_price_major: 85, pricing_status: "variant_published_list" })
    ).toBe(1);
    expect(
      snapshotClientPriceAudit(85, { unit_price_major: 85, pricing_status: "variant_published_list" })
    ).toBeNull();
    expect(
      snapshotClientPriceAudit(85, { unit_price_major: null, pricing_status: "request_pricing" })
    ).toBe(85);
  });
});

describe("quotePublishedListLookupQueryCount", () => {
  it("is batched: 3 unique variants in one family is 1 pricing + 1 product query", () => {
    expect(quotePublishedListLookupQueryCount(3, 1)).toBe(2);
  });

  it("51 unique variants is 2 pricing batches, not N", () => {
    expect(quotePublishedListLookupQueryCount(51, 1)).toBe(3);
  });

  it("unmapped-only quote is 1 pricing query and 0 product queries", () => {
    expect(quotePublishedListLookupQueryCount(3, 0)).toBe(1);
  });
});

function mockAdmin(opts: {
  pricing: Record<string, unknown>[];
  products: Record<string, unknown>[];
  onPricingIn?: (ids: string[]) => void;
  onProductIn?: (ids: string[]) => void;
}) {
  return {
    from(table: string) {
      if (table !== "variant_best_offer_price") throw new Error(table);
      return {
        select: () => ({
          in: async (_col: string, ids: string[]) => {
            opts.onPricingIn?.(ids);
            return { data: opts.pricing, error: null };
          },
        }),
      };
    },
    schema(schema: string) {
      return {
        from(table: string) {
          if (schema !== "catalog_v2" || table !== "catalog_products") {
            throw new Error(`${schema}.${table}`);
          }
          return {
            select: () => ({
              in: async (_col: string, ids: string[]) => {
                opts.onProductIn?.(ids);
                return { data: opts.products, error: null };
              },
            }),
          };
        },
      };
    },
  } as never;
}

describe("resolveQuoteRequestPublishedListPrices batch + trust", () => {
  it("valid mapped / stale / tampered / unmapped / family-unpriced in one batched lookup", async () => {
    let pricingCalls = 0;
    let productCalls = 0;
    const client = mockAdmin({
      pricing: [
        {
          catalog_variant_id: small,
          catalog_product_id: PRODUCT_ID,
          list_unit_price_major: 90,
          offer_count: 1,
          pricing_source: "catalogos.supplier_offers.variant_fk_sell_v1",
          currency_code: "USD",
        },
      ],
      products: [{ id: PRODUCT_ID, status: "active" }],
      onPricingIn: () => {
        pricingCalls += 1;
      },
      onProductIn: () => {
        productCalls += 1;
      },
    });

    const results = await resolveQuoteRequestPublishedListPrices(client, [
      { product_id: PRODUCT_ID, catalog_variant_id: small },
      { product_id: PRODUCT_ID, catalog_variant_id: small },
      { product_id: PRODUCT_ID, catalog_variant_id: medium },
      { product_id: PRODUCT_ID, catalog_variant_id: null },
    ]);

    expect(results[0]).toEqual({ unit_price_major: 90, pricing_status: "variant_published_list" });
    expect(results[1]).toEqual({ unit_price_major: 90, pricing_status: "variant_published_list" });
    expect(results[2]).toEqual(QUOTE_REQUEST_PRICING);
    expect(results[3]).toEqual(QUOTE_REQUEST_PRICING);
    expect(pricingCalls).toBe(1);
    expect(productCalls).toBe(1);
  });

  it("does not query products when every variant is unpriced", async () => {
    const onProductIn = vi.fn();
    const client = mockAdmin({
      pricing: [],
      products: [],
      onProductIn,
    });
    const results = await resolveQuoteRequestPublishedListPrices(client, [
      { product_id: PRODUCT_ID, catalog_variant_id: medium },
    ]);
    expect(results[0]).toEqual(QUOTE_REQUEST_PRICING);
    expect(onProductIn).not.toHaveBeenCalled();
  });

  it("never reads client unit_price_major from the line input type", () => {
    const src = readFileSync(path.join(__dirname, "resolve-quote-published-list.ts"), "utf8");
    expect(src).not.toMatch(/unit_price_major:\s*line/);
    expect(src).not.toContain("gc_resolve_buyer_unit_price");
    expect(src).not.toContain("product_best_offer_price");
    expect(src).not.toContain("standard_cost_per_case");
    expect(src).not.toContain("supplier_cost");
    expect(src).not.toContain("casePrice");
    expect(src).toContain("fetchVariantPricingRows");
    expect(src).not.toContain("fetchVariantCaseEconomicsBatch");
  });
});
