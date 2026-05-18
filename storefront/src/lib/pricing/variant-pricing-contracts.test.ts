import { describe, expect, it } from "vitest";
import {
  mapBuyerRpcToPdpReference,
  mapCaseEconomicsRow,
  mapVariantPricingRow,
} from "@/lib/pricing/variant-pricing-contracts";

describe("variant-pricing-contracts mappers", () => {
  it("maps variant pricing row with finite list only", () => {
    const row = mapVariantPricingRow({
      catalog_variant_id: "v1",
      catalog_product_id: "p1",
      list_unit_price_major: 12.5,
      offer_count: 2,
      pricing_source: "catalogos.supplier_offers.variant_sku_v1",
      currency_code: "USD",
    });
    expect(row?.listUnitPriceMajor).toBe(12.5);
    expect(row?.catalogVariantId).toBe("v1");
  });

  it("rejects non-positive list_unit_price_major", () => {
    expect(
      mapVariantPricingRow({
        catalog_variant_id: "v1",
        catalog_product_id: "p1",
        list_unit_price_major: 0,
        offer_count: 1,
        pricing_source: "x",
        currency_code: "USD",
      })?.listUnitPriceMajor
    ).toBeNull();
  });

  it("maps case economics without error", () => {
    const row = mapCaseEconomicsRow({
      catalog_variant_id: "v1",
      units_per_case: 100,
      uom_label: "each",
      cost_basis: "per_case",
      list_unit_price_major: 0.12,
      list_case_price_major: 12,
      case_pricing_source: "supplier_offer.cost_basis_v1",
      normalization_confidence: "high",
    });
    expect(row?.listCasePriceMajor).toBe(12);
    expect(row?.unitsPerCase).toBe(100);
  });

  it("skips case row when rpc item has error", () => {
    expect(mapCaseEconomicsRow({ catalog_variant_id: "v1", error: "variant_not_found" })).toBeNull();
  });

  it("maps buyer reference only for variant-specific tier source", () => {
    const ref = mapBuyerRpcToPdpReference({
      company_id: "c1",
      catalog_variant_id: "v1",
      quantity: 1,
      list_unit_price_major: 10,
      list_unit_price_minor: 1000,
      pricing_tier_code: "cub",
      discount_percent: 10,
      resolved_unit_price_major: 9,
      resolved_unit_price_minor: 900,
      currency_code: "USD",
      pricing_source: "site_variant_list_x_company_tier_v1",
      is_variant_specific_list: true,
    });
    expect(ref?.yourUsd).toBe(9);
    expect(ref?.isVariantSpecificList).toBe(true);
  });

  it("does not map legacy product-level pricing source", () => {
    expect(
      mapBuyerRpcToPdpReference({
        company_id: "c1",
        catalog_variant_id: "v1",
        quantity: 1,
        list_unit_price_major: 10,
        list_unit_price_minor: 1000,
        pricing_tier_code: "cub",
        discount_percent: 10,
        resolved_unit_price_major: 9,
        resolved_unit_price_minor: 900,
        currency_code: "USD",
        pricing_source: "site_best_offer_x_company_tier_v1",
      })
    ).toBeNull();
  });
});
