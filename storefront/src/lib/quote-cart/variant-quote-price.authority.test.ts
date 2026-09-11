import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { COMMERCE_PACKAGING_SCHEMA_VERSION } from "@commerce-packaging/types";
import { buildPdpQuoteCommerce } from "@/components/quote/AddToQuoteButton";
import { pdpCommerceFromProductMetadata } from "@/lib/catalog/store-product-commerce";
import {
  quoteUnitPriceMajorFromSelectedVariant,
  resolvePdpSelectedVariantPricingDisplay,
} from "@/lib/pricing/pdp-variant-pricing-display";
import { buildQuoteLineCommerceFields, formatQuoteCartLinePrimary } from "@/lib/quote-cart/commerce-line";
import { normalizeQuoteCartLineInput } from "@/lib/quote-cart/line-utils";
import type { PdpVariantPricingRow } from "@/lib/pricing/variant-pricing-contracts";

const SRC_ROOT = path.resolve(__dirname, "../..");

function row(
  id: string,
  list: number | null
): PdpVariantPricingRow {
  return {
    catalogVariantId: id,
    catalogProductId: "family-1",
    listUnitPriceMajor: list,
    offerCount: list != null ? 1 : 0,
    pricingSource: list != null ? "catalogos.supplier_offers.variant_fk_sell_v1" : "unavailable",
    currencyCode: "USD",
  };
}

const xs = "var-xs";
const small = "var-s";
const medium = "var-m";
const large = "var-l";
const xl = "var-xl";

const mixedFamily: PdpVariantPricingRow[] = [
  row(xs, null),
  row(small, 85),
  row(medium, null),
  row(large, null),
  row(xl, null),
];

const twoMapped: PdpVariantPricingRow[] = [row(small, 85), row(medium, 92)];

const packagingWithCasePrice = pdpCommerceFromProductMetadata(
  {
    commerce_packaging: {
      schema_version: COMMERCE_PACKAGING_SCHEMA_VERSION,
      sell_by_case_enabled: true,
      sell_by_pallet_enabled: false,
      minimum_sell_unit: "case",
      bulk_sell_unit: "case",
      inner_unit_type: null,
      units_per_inner: null,
      inners_per_case: null,
      units_per_case: 1000,
      units_per_case_overridden: false,
      unit_noun: "gloves",
      case_label: null,
      cases_per_pallet: null,
      units_per_pallet: null,
      units_per_pallet_overridden: false,
      pallet_label: null,
      case_price: 1220,
      compare_at_case_price: null,
      standard_cost_per_case: 40,
      compare_at_pallet_price: null,
      pallet_price: null,
      pallet_discount_percent: null,
      msrp_per_case: null,
      field_provenance: {},
      parse_warnings: [],
    },
  },
  85
);

function quoteCommerceFor(variantId: string, pricing: PdpVariantPricingRow[]) {
  const selected = resolvePdpSelectedVariantPricingDisplay(variantId, pricing, undefined);
  const authoritative = quoteUnitPriceMajorFromSelectedVariant(selected);
  return buildPdpQuoteCommerce(packagingWithCasePrice, "case", 1, authoritative);
}

function quotePriceFor(variantId: string, pricing: PdpVariantPricingRow[]): number | null {
  return quoteCommerceFor(variantId, pricing).unit_price_major ?? null;
}

describe("variant-authoritative quote price", () => {
  it("mapped Small $85 stores $85 with variant_published_list provenance", () => {
    const commerce = quoteCommerceFor(small, mixedFamily);
    expect(commerce.unit_price_major).toBe(85);
    expect(commerce.pricing_status).toBe("variant_published_list");
    const line = normalizeQuoteCartLineInput({
      product_id: "550e8400-e29b-41d4-a716-446655440000",
      name: "ProWorks",
      slug: "proworks",
      brandName: null,
      catalog_variant_id: small,
      variant_sku: "GLV-GL-N125S",
      size_code: "s",
      ...commerce,
    });
    expect(line.unit_price_major).toBe(85);
    expect(line.pricing_status).toBe("variant_published_list");
    expect(formatQuoteCartLinePrimary({ ...line, quantity: 1 })).toContain("$85.00");
  });

  it("unmapped Medium with family best $85 stores request pricing", () => {
    const commerce = quoteCommerceFor(medium, mixedFamily);
    expect(commerce.unit_price_major).toBeNull();
    expect(commerce.pricing_status).toBe("request_pricing");
    const line = normalizeQuoteCartLineInput({
      product_id: "550e8400-e29b-41d4-a716-446655440000",
      name: "ProWorks",
      slug: "proworks",
      brandName: null,
      catalog_variant_id: medium,
      variant_sku: "GLV-GL-N125M",
      size_code: "m",
      ...commerce,
    });
    expect(line.unit_price_major).toBeNull();
    expect(line.pricing_status).toBe("request_pricing");
    expect(formatQuoteCartLinePrimary({ ...line, quantity: 1 })).toBe("1 case · Request pricing");
  });

  it("Medium $92 does not become family min $85", () => {
    expect(quotePriceFor(medium, twoMapped)).toBe(92);
    expect(quotePriceFor(small, twoMapped)).toBe(85);
  });

  it("only the mapped size in a five-size family gets a price", () => {
    expect(quotePriceFor(xs, mixedFamily)).toBeNull();
    expect(quotePriceFor(small, mixedFamily)).toBe(85);
    expect(quotePriceFor(medium, mixedFamily)).toBeNull();
    expect(quotePriceFor(large, mixedFamily)).toBeNull();
    expect(quotePriceFor(xl, mixedFamily)).toBeNull();
  });

  it("packaging casePrice and standard_cost_per_case do not invent a quote price", () => {
    expect(packagingWithCasePrice.casePrice).toBe(1220);
    const fields = buildQuoteLineCommerceFields("case", 1, packagingWithCasePrice, null);
    expect(fields.unit_price_major).toBeNull();
    expect(fields.units_per_case).toBe(1000);
  });
});

describe("quote quote-price source policy", () => {
  it("PDP no longer falls back to family bestPrice for quote commerce", () => {
    const pdp = readFileSync(path.join(SRC_ROOT, "components/store/pdp/StorePdpContent.tsx"), "utf8");
    expect(pdp).toContain("quoteUnitPriceMajorFromSelectedVariant");
    expect(pdp).not.toMatch(/return detail\.bestPrice/);
    expect(pdp).not.toMatch(/variantListPriceFallback/);
  });

  it("listing add-to-quote does not use casePrice ?? bestPrice", () => {
    const btn = readFileSync(path.join(SRC_ROOT, "components/quote/AddToQuoteButton.tsx"), "utf8");
    expect(btn).not.toMatch(/casePrice\s*\?\?\s*product\.bestPrice/);
    expect(btn).toContain("buildQuoteLineCommerceFields(\"case\", 1, pkg, null)");
  });

  it("quote line builder does not fall back to pkg.casePrice or pkg.palletPrice", () => {
    const src = readFileSync(path.join(SRC_ROOT, "lib/quote-cart/commerce-line.ts"), "utf8");
    expect(src).not.toMatch(/unitPriceOverride\s*\?\?/);
    expect(src).not.toMatch(/pkg\.palletPrice/);
    expect(src).not.toMatch(/pkg\.casePrice/);
    expect(src).not.toMatch(/\bcost\b/);
  });
});
