import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "path";
import { z } from "zod";
import { formatQuoteCartLinePrimary } from "@/lib/quote-cart/commerce-line";
import { normalizeQuoteCartLineInput } from "@/lib/quote-cart/line-utils";
import {
  formatQuoteRequestEmailPriceLabel,
  resolveQuoteLinePublishedList,
} from "@/lib/quote-cart/resolve-quote-published-list";
import { QUOTE_CART_STORAGE_KEY } from "@/lib/quote-cart/types";
import type { QuoteCartItem } from "@/lib/quote-cart/types";
import {
  quoteUnitPriceMajorFromSelectedVariant,
  resolvePdpSelectedVariantPricingDisplay,
} from "@/lib/pricing/pdp-variant-pricing-display";
import type { PdpVariantPricingRow } from "@/lib/pricing/variant-pricing-contracts";

const SRC_ROOT = path.resolve(__dirname, "../..");
const QUOTE_REQUEST_ROUTE = readFileSync(path.join(SRC_ROOT, "app/api/quote-request/route.ts"), "utf8");
const QUOTE_CART_PAGE = readFileSync(path.join(SRC_ROOT, "app/quote-cart/page.tsx"), "utf8");
const PROVIDER = readFileSync(path.join(SRC_ROOT, "components/quote/QuoteCartProvider.tsx"), "utf8");
const KILL_SWITCH = readFileSync(path.join(SRC_ROOT, "lib/catalog/emergency-catalog-kill-switch.ts"), "utf8");

const PRODUCT_ID = "550e8400-e29b-41d4-a716-446655440001";
const xs = "11111111-1111-4111-8111-111111111111";
const small = "22222222-2222-4211-8222-222222222222";
const medium = "33333333-3333-4311-8333-333333333333";
const large = "44444444-4444-4411-8444-444444444444";
const xl = "55555555-5555-4511-8555-555555555555";

function pricingRow(id: string, list: number | null): PdpVariantPricingRow {
  return {
    catalogVariantId: id,
    catalogProductId: PRODUCT_ID,
    listUnitPriceMajor: list,
    offerCount: list != null ? 1 : 0,
    pricingSource: list != null ? "catalogos.supplier_offers.variant_fk_sell_v1" : "unavailable",
    currencyCode: "USD",
  };
}

const fiveSizeFamily: PdpVariantPricingRow[] = [
  pricingRow(xs, null),
  pricingRow(small, 85),
  pricingRow(medium, null),
  pricingRow(large, 92),
  pricingRow(xl, null),
];

/** Same hydrate path QuoteCartProvider.readCart uses after JSON.parse. */
function hydrateStoredLine(raw: Omit<QuoteCartItem, "quantity"> & { quantity: number }): QuoteCartItem {
  const { quantity, ...rest } = raw;
  return {
    ...normalizeQuoteCartLineInput(rest),
    quantity: Math.max(1, Math.min(99999, Math.floor(quantity))),
  };
}

/** Mirrors quote-cart page → POST /api/quote-request item mapping. */
function submitPayloadFromCart(item: QuoteCartItem) {
  return {
    product_id: item.product_id,
    name: item.name,
    slug: item.slug,
    brandName: item.brandName,
    quantity: item.quantity,
    catalog_variant_id: item.catalog_variant_id ?? null,
    variant_sku: item.variant_sku ?? null,
    size_code: item.size_code ?? null,
    sell_unit: item.sell_unit ?? "case",
    unit_price_major: item.unit_price_major ?? null,
  };
}

function persistAuthoritativeSnapshot(
  item: ReturnType<typeof submitPayloadFromCart>,
  serverList: number | null,
  productStatus: string = "active"
) {
  const vid = item.catalog_variant_id;
  const published = resolveQuoteLinePublishedList({
    sellUnit: item.sell_unit,
    catalogVariantId: vid,
    productId: item.product_id,
    pricingRow:
      vid && serverList != null
        ? {
            catalogVariantId: vid,
            catalogProductId: item.product_id,
            listUnitPriceMajor: serverList,
            offerCount: 1,
            pricingSource: "catalogos.supplier_offers.variant_fk_sell_v1",
            currencyCode: "USD",
          }
        : undefined,
    productStatus,
  });
  return {
    catalog_v2_product_id: item.product_id,
    catalog_v2_variant_id: item.catalog_variant_id ?? null,
    variant_sku: item.variant_sku ?? null,
    size_code: item.size_code ?? null,
    quantity: item.quantity,
    unit_price_major: published.unit_price_major,
    pricing_status: published.pricing_status,
    email: formatQuoteRequestEmailPriceLabel(published.unit_price_major),
  };
}

const itemSchema = z.object({
  product_id: z.string().uuid(),
  unit_price_major: z.number().positive().max(1_000_000).optional().nullable(),
  catalog_variant_id: z.string().uuid().nullish(),
});

describe("five-size mixed family quote authority", () => {
  it("XS/M/XL request pricing; S=$85; L=$92; no sibling inheritance", () => {
    const price = (id: string) =>
      quoteUnitPriceMajorFromSelectedVariant(
        resolvePdpSelectedVariantPricingDisplay(id, fiveSizeFamily, undefined)
      );
    expect(price(xs)).toBeNull();
    expect(price(small)).toBe(85);
    expect(price(medium)).toBeNull();
    expect(price(large)).toBe(92);
    expect(price(xl)).toBeNull();
  });
});

describe("legacy localStorage cart after the trust-boundary fix", () => {
  it("keeps the v1 storage key and items[] envelope — no cart-level schema_version", () => {
    expect(QUOTE_CART_STORAGE_KEY).toBe("glovecubs-quote-cart-v1");
    expect(PROVIDER).toContain("JSON.stringify({ items })");
    expect(PROVIDER).not.toMatch(/schema_version/);
  });

  it("hydrates a stale unlabeled family-min $85 on unmapped Medium as Request pricing", () => {
    const stored = {
      product_id: PRODUCT_ID,
      name: "ProWorks Blue-Violet Nitrile Exam Gloves",
      slug: "proworks-blue-violet-nitrile-exam-gloves",
      brandName: "ProWorks",
      quantity: 2,
      catalog_variant_id: medium,
      variant_sku: "GLV-GL-N125M",
      size_code: "m",
      sell_unit: "case" as const,
      unit_price_major: 85,
    };
    const hydrated = hydrateStoredLine(stored);
    expect(hydrated.catalog_variant_id).toBe(medium);
    expect(hydrated.quantity).toBe(2);
    expect(hydrated.unit_price_major).toBeNull();
    expect(hydrated.pricing_status).toBe("request_pricing");
    expect(formatQuoteCartLinePrimary(hydrated)).toContain("Request pricing");
    expect(formatQuoteCartLinePrimary(hydrated)).not.toContain("$85.00");

    const payload = submitPayloadFromCart(hydrated);
    expect(payload.unit_price_major).toBeNull();
    expect(itemSchema.safeParse(payload).success).toBe(true);
    const snap = persistAuthoritativeSnapshot(payload, null);
    expect(snap.unit_price_major).toBeNull();
    expect(snap.email).toBe("request pricing");
  });

  it("keeps a stamped variant_published_list price for cart UX only", () => {
    const hydrated = hydrateStoredLine({
      product_id: PRODUCT_ID,
      name: "ProWorks",
      slug: "proworks",
      brandName: null,
      quantity: 1,
      catalog_variant_id: small,
      variant_sku: "GLV-GL-N125S",
      size_code: "s",
      unit_price_major: 85,
      pricing_status: "variant_published_list",
    });
    expect(hydrated.unit_price_major).toBe(85);
    expect(hydrated.pricing_status).toBe("variant_published_list");
    expect(formatQuoteCartLinePrimary(hydrated)).toContain("$85.00");
  });
});

describe("quote-request API trust boundary", () => {
  it("mapped Small client 85 / server 85 persists 85 published list", () => {
    const snap = persistAuthoritativeSnapshot(
      submitPayloadFromCart(
        hydrateStoredLine({
          product_id: PRODUCT_ID,
          name: "ProWorks",
          slug: "proworks",
          brandName: null,
          quantity: 1,
          catalog_variant_id: small,
          variant_sku: "GLV-GL-N125S",
          size_code: "s",
          unit_price_major: 85,
          pricing_status: "variant_published_list",
        })
      ),
      85
    );
    expect(snap.unit_price_major).toBe(85);
    expect(snap.email).toBe("published list 85");
  });

  it("client stale mapped 85 vs server 92 persists 92", () => {
    const snap = persistAuthoritativeSnapshot(
      submitPayloadFromCart(
        hydrateStoredLine({
          product_id: PRODUCT_ID,
          name: "ProWorks",
          slug: "proworks",
          brandName: null,
          quantity: 1,
          catalog_variant_id: small,
          variant_sku: "GLV-GL-N125S",
          size_code: "s",
          unit_price_major: 85,
          pricing_status: "variant_published_list",
        })
      ),
      92
    );
    expect(snap.unit_price_major).toBe(92);
    expect(snap.email).toBe("published list 92");
  });

  it("tampered mapped $1 persists server 85, not $1", () => {
    const tampered = submitPayloadFromCart(
      hydrateStoredLine({
        product_id: PRODUCT_ID,
        name: "ProWorks",
        slug: "proworks",
        brandName: null,
        quantity: 1,
        catalog_variant_id: small,
        variant_sku: "GLV-GL-N125S",
        size_code: "s",
        unit_price_major: 1,
        pricing_status: "variant_published_list",
      })
    );
    expect(itemSchema.safeParse(tampered).success).toBe(true);
    const snap = persistAuthoritativeSnapshot(tampered, 85);
    expect(snap.unit_price_major).toBe(85);
    expect(snap.email).toBe("published list 85");
  });

  it("unmapped Medium client 85 persists null / request pricing", () => {
    const snap = persistAuthoritativeSnapshot(
      submitPayloadFromCart(
        hydrateStoredLine({
          product_id: PRODUCT_ID,
          name: "ProWorks",
          slug: "proworks",
          brandName: null,
          quantity: 1,
          catalog_variant_id: medium,
          variant_sku: "GLV-GL-N125M",
          size_code: "m",
          unit_price_major: 85,
        })
      ),
      null
    );
    expect(snap.unit_price_major).toBeNull();
    expect(snap.email).toBe("request pricing");
  });

  it("tampered unmapped $1 persists null / request pricing", () => {
    const tampered = submitPayloadFromCart(
      hydrateStoredLine({
        product_id: PRODUCT_ID,
        name: "ProWorks",
        slug: "proworks",
        brandName: null,
        quantity: 1,
        catalog_variant_id: medium,
        variant_sku: "GLV-GL-N125M",
        size_code: "m",
        unit_price_major: 1,
        pricing_status: "variant_published_list",
      })
    );
    expect(quoteUnitPriceMajorFromSelectedVariant(
      resolvePdpSelectedVariantPricingDisplay(medium, fiveSizeFamily, undefined)
    )).toBeNull();
    expect(itemSchema.safeParse(tampered).success).toBe(true);
    const snap = persistAuthoritativeSnapshot(tampered, null);
    expect(snap.unit_price_major).toBeNull();
    expect(snap.email).toBe("request pricing");
  });

  it("price removed after add (cart 85, server now null) persists request pricing", () => {
    const snap = persistAuthoritativeSnapshot(
      submitPayloadFromCart(
        hydrateStoredLine({
          product_id: PRODUCT_ID,
          name: "ProWorks",
          slug: "proworks",
          brandName: null,
          quantity: 1,
          catalog_variant_id: small,
          variant_sku: "GLV-GL-N125S",
          size_code: "s",
          unit_price_major: 85,
          pricing_status: "variant_published_list",
        })
      ),
      null
    );
    expect(snap.unit_price_major).toBeNull();
    expect(snap.email).toBe("request pricing");
  });

  it("price changed after add (cart 85, server now 90) persists 90", () => {
    const snap = persistAuthoritativeSnapshot(
      submitPayloadFromCart(
        hydrateStoredLine({
          product_id: PRODUCT_ID,
          name: "ProWorks",
          slug: "proworks",
          brandName: null,
          quantity: 1,
          catalog_variant_id: small,
          variant_sku: "GLV-GL-N125S",
          size_code: "s",
          unit_price_major: 85,
          pricing_status: "variant_published_list",
        })
      ),
      90
    );
    expect(snap.unit_price_major).toBe(90);
    expect(snap.email).toBe("published list 90");
  });

  it("inactive product is not persisted as published list", () => {
    const snap = persistAuthoritativeSnapshot(
      submitPayloadFromCart(
        hydrateStoredLine({
          product_id: PRODUCT_ID,
          name: "ProWorks",
          slug: "proworks",
          brandName: null,
          quantity: 1,
          catalog_variant_id: small,
          variant_sku: "GLV-GL-N125S",
          size_code: "s",
          unit_price_major: 85,
          pricing_status: "variant_published_list",
        })
      ),
      85,
      "inactive"
    );
    expect(snap.unit_price_major).toBeNull();
    expect(snap.email).toBe("request pricing");
  });

  it("resolves published list via batched variant authority — does not trust client or cost fallbacks", () => {
    expect(QUOTE_REQUEST_ROUTE).toContain("resolveQuoteRequestPublishedListPrices");
    expect(QUOTE_REQUEST_ROUTE).toContain("formatQuoteRequestEmailPriceLabel");
    expect(QUOTE_REQUEST_ROUTE).not.toContain("unit_price_major: item.unit_price_major ?? null");
    expect(QUOTE_REQUEST_ROUTE).not.toContain("published list ${i.unit_price_major}");
    expect(QUOTE_REQUEST_ROUTE).not.toMatch(/gc_resolve_buyer_unit_price/);
    expect(QUOTE_REQUEST_ROUTE).not.toMatch(/product_best_offer_price/);
    expect(QUOTE_REQUEST_ROUTE).not.toMatch(/bestPrice/);
    expect(QUOTE_REQUEST_ROUTE).not.toMatch(/casePrice/);
    expect(QUOTE_REQUEST_ROUTE).not.toMatch(/supplier_cost/);
    expect(QUOTE_REQUEST_ROUTE).not.toMatch(/standard_cost_per_case/);
  });

  it("quote cart submit still forwards stored unit_price_major as untrusted UI context", () => {
    expect(QUOTE_CART_PAGE).toContain("unit_price_major: i.unit_price_major ?? null");
    expect(QUOTE_CART_PAGE).not.toMatch(/bestPrice/);
    expect(QUOTE_CART_PAGE).not.toMatch(/variant_best_offer_price/);
  });

  it("does not change the catalog kill switch", () => {
    expect(KILL_SWITCH).toContain("GC_EMERGENCY_DISABLE_CATALOG_SUPABASE");
    expect(KILL_SWITCH).toContain('process.env.GC_EMERGENCY_DISABLE_CATALOG_SUPABASE === "1"');
  });
});
