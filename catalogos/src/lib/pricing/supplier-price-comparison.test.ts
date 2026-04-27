import { describe, it, expect } from "vitest";
import {
  compareSupplierNormalizedPrices,
  DEFAULT_GLOVE_SUPPLIER_PRICE_COMPARISON_CONFIG,
  type SupplierPriceComparisonConfig,
  type SupplierPriceComparisonInputOffer,
} from "./supplier-price-comparison";

const PID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const fixedNow = "2026-01-01T00:00:00.000Z";

function baseConfig(over: Partial<SupplierPriceComparisonConfig> = {}): SupplierPriceComparisonConfig {
  return { ...DEFAULT_GLOVE_SUPPLIER_PRICE_COMPARISON_CONFIG, ...over };
}

describe("compareSupplierNormalizedPrices", () => {
  it("two suppliers, same case UOM → picks lower case price", () => {
    const offers: SupplierPriceComparisonInputOffer[] = [
      {
        id: "o1",
        supplier_id: "s1",
        normalized_unit_cost_minor: 12_000,
        normalized_unit_uom: "case",
        normalization_confidence: "medium",
      },
      {
        id: "o2",
        supplier_id: "s2",
        normalized_unit_cost_minor: 10_000,
        normalized_unit_uom: "case",
        normalization_confidence: "high",
      },
    ];
    const r = compareSupplierNormalizedPrices({
      catalog_product_id: PID,
      offers,
      sellable: { list_price_minor: 11_000 },
      config: baseConfig(),
      computed_at: fixedNow,
    });
    expect(r.best_price_supplier_id).toBe("s2");
    expect(r.best_offer_id).toBe("o2");
    expect(r.best_price_minor).toBe(10_000n);
    expect(r.eligible_offer_count).toBe(2);
    expect(r.supplier_count).toBe(2);
    expect(r.spread_minor).toBe(2_000n);
    expect(r.delta_baseline_minor).toBe(-1_000n);
    expect(r.baseline_field).toBe("list_price_minor");
    expect(r.flags).not.toContain("no_case_comparable_price");
  });

  it("ignores low confidence offer", () => {
    const offers: SupplierPriceComparisonInputOffer[] = [
      {
        id: "cheap-low",
        supplier_id: "s-low",
        normalized_unit_cost_minor: 1,
        normalized_unit_uom: "case",
        normalization_confidence: "low",
      },
      {
        id: "ok",
        supplier_id: "s-ok",
        normalized_unit_cost_minor: 9_000,
        normalized_unit_uom: "case",
        normalization_confidence: "medium",
      },
    ];
    const r = compareSupplierNormalizedPrices({
      catalog_product_id: PID,
      offers,
      sellable: null,
      config: baseConfig(),
      computed_at: fixedNow,
    });
    expect(r.best_price_supplier_id).toBe("s-ok");
    expect(r.best_offer_id).toBe("ok");
    expect(r.eligible_offer_count).toBe(1);
  });

  it("ignores null / zero normalized price", () => {
    const offers: SupplierPriceComparisonInputOffer[] = [
      {
        id: "a",
        supplier_id: "s1",
        normalized_unit_cost_minor: null,
        normalized_unit_uom: "case",
        normalization_confidence: "high",
      },
      {
        id: "b",
        supplier_id: "s2",
        normalized_unit_cost_minor: 0,
        normalized_unit_uom: "case",
        normalization_confidence: "high",
      },
      {
        id: "c",
        supplier_id: "s3",
        normalized_unit_cost_minor: 5_000,
        normalized_unit_uom: "case",
        normalization_confidence: "high",
      },
    ];
    const r = compareSupplierNormalizedPrices({
      catalog_product_id: PID,
      offers,
      sellable: null,
      config: baseConfig(),
      computed_at: fixedNow,
    });
    expect(r.best_offer_id).toBe("c");
    expect(r.eligible_offer_count).toBe(1);
  });

  it("each UOM does not compare directly to case", () => {
    const offers: SupplierPriceComparisonInputOffer[] = [
      {
        id: "case-offer",
        supplier_id: "s1",
        normalized_unit_cost_minor: 10_000,
        normalized_unit_uom: "case",
        normalization_confidence: "medium",
      },
      {
        id: "each-cheap",
        supplier_id: "s2",
        normalized_unit_cost_minor: 50,
        normalized_unit_uom: "each",
        normalization_confidence: "high",
        pack_qty: 100,
      },
    ];
    const r = compareSupplierNormalizedPrices({
      catalog_product_id: PID,
      offers,
      sellable: null,
      config: baseConfig({ allow_derive_case_from_each: false }),
      computed_at: fixedNow,
    });
    expect(r.best_price_minor).toBe(10_000n);
    expect(r.best_offer_id).toBe("case-offer");
    expect(r.flags).not.toContain("derived_case_from_each");
  });

  it("each + pack_qty can derive case when explicitly allowed", () => {
    const offers: SupplierPriceComparisonInputOffer[] = [
      {
        id: "each-derived",
        supplier_id: "s1",
        normalized_unit_cost_minor: 100,
        normalized_unit_uom: "each",
        normalization_confidence: "high",
        pack_qty: 10,
      },
      {
        id: "case-higher",
        supplier_id: "s2",
        normalized_unit_cost_minor: 2_000,
        normalized_unit_uom: "case",
        normalization_confidence: "medium",
      },
    ];
    const r = compareSupplierNormalizedPrices({
      catalog_product_id: PID,
      offers,
      sellable: null,
      config: baseConfig({ allow_derive_case_from_each: true }),
      computed_at: fixedNow,
    });
    expect(r.best_offer_id).toBe("each-derived");
    expect(r.best_price_minor).toBe(1_000n);
    expect(r.flags).toContain("derived_case_from_each");
  });

  it("baseline delta uses case basis with bulk preferred", () => {
    const offers: SupplierPriceComparisonInputOffer[] = [
      {
        id: "o1",
        supplier_id: "s1",
        normalized_unit_cost_minor: 8_000,
        normalized_unit_uom: "case",
        normalization_confidence: "medium",
      },
    ];
    const r = compareSupplierNormalizedPrices({
      catalog_product_id: PID,
      offers,
      sellable: { bulk_price_minor: 10_000, list_price_minor: 12_000 },
      config: baseConfig(),
      computed_at: fixedNow,
    });
    expect(r.baseline_field).toBe("bulk_price_minor");
    expect(r.baseline_price_minor).toBe(10_000n);
    expect(r.delta_baseline_minor).toBe(-2_000n);
    expect(r.flags).not.toContain("no_baseline");
  });

  it("no baseline → flag and null delta", () => {
    const offers: SupplierPriceComparisonInputOffer[] = [
      {
        id: "o1",
        supplier_id: "s1",
        normalized_unit_cost_minor: 1_000,
        normalized_unit_uom: "case",
        normalization_confidence: "medium",
      },
    ];
    const r = compareSupplierNormalizedPrices({
      catalog_product_id: PID,
      offers,
      sellable: {},
      config: baseConfig(),
      computed_at: fixedNow,
    });
    expect(r.baseline_price_minor).toBeNull();
    expect(r.delta_baseline_minor).toBeNull();
    expect(r.flags).toContain("no_baseline");
  });

  const baselineCaseOffer: SupplierPriceComparisonInputOffer[] = [
    {
      id: "o-baseline",
      supplier_id: "s1",
      normalized_unit_cost_minor: 5_000,
      normalized_unit_uom: "case",
      normalization_confidence: "medium",
    },
  ];

  it("baseline: bulk_price_minor = 0n and list_price_minor > 0 → uses list", () => {
    const r = compareSupplierNormalizedPrices({
      catalog_product_id: PID,
      offers: baselineCaseOffer,
      sellable: { bulk_price_minor: 0n, list_price_minor: 3_000n },
      config: baseConfig(),
      computed_at: fixedNow,
    });
    expect(r.baseline_field).toBe("list_price_minor");
    expect(r.baseline_price_minor).toBe(3_000n);
    expect(r.delta_baseline_minor).toBe(2_000n);
    expect(r.flags).not.toContain("no_baseline");
  });

  it("baseline: bulk_price_minor = null and list_price_minor > 0 → uses list", () => {
    const r = compareSupplierNormalizedPrices({
      catalog_product_id: PID,
      offers: baselineCaseOffer,
      sellable: { bulk_price_minor: null, list_price_minor: 4_000n },
      config: baseConfig(),
      computed_at: fixedNow,
    });
    expect(r.baseline_field).toBe("list_price_minor");
    expect(r.baseline_price_minor).toBe(4_000n);
    expect(r.delta_baseline_minor).toBe(1_000n);
  });

  it("baseline: bulk_price_minor = 0n and list_price_minor = 0n → no_baseline", () => {
    const r = compareSupplierNormalizedPrices({
      catalog_product_id: PID,
      offers: baselineCaseOffer,
      sellable: { bulk_price_minor: 0n, list_price_minor: 0n },
      config: baseConfig(),
      computed_at: fixedNow,
    });
    expect(r.baseline_field).toBeNull();
    expect(r.baseline_price_minor).toBeNull();
    expect(r.delta_baseline_minor).toBeNull();
    expect(r.flags).toContain("no_baseline");
  });

  it("baseline: bulk_price_minor > 0 → uses bulk", () => {
    const r = compareSupplierNormalizedPrices({
      catalog_product_id: PID,
      offers: baselineCaseOffer,
      sellable: { bulk_price_minor: 8_000n, list_price_minor: 2_000n },
      config: baseConfig(),
      computed_at: fixedNow,
    });
    expect(r.baseline_field).toBe("bulk_price_minor");
    expect(r.baseline_price_minor).toBe(8_000n);
    expect(r.delta_baseline_minor).toBe(-3_000n);
  });

  it("no incumbent → flag", () => {
    const offers: SupplierPriceComparisonInputOffer[] = [
      {
        id: "o1",
        supplier_id: "s1",
        normalized_unit_cost_minor: 1_000,
        normalized_unit_uom: "case",
        normalization_confidence: "medium",
      },
    ];
    const r = compareSupplierNormalizedPrices({
      catalog_product_id: PID,
      offers,
      sellable: null,
      config: baseConfig(),
      computed_at: fixedNow,
    });
    expect(r.flags).toContain("no_incumbent");
    expect(r.incumbent_overpriced_vs_market).toBe(false);
  });

  it("incumbent overpriced vs best supplier", () => {
    const offers: SupplierPriceComparisonInputOffer[] = [
      {
        id: "best",
        supplier_id: "s-best",
        normalized_unit_cost_minor: 5_000,
        normalized_unit_uom: "case",
        normalization_confidence: "medium",
      },
      {
        id: "inc1",
        supplier_id: "s-inc",
        normalized_unit_cost_minor: 8_000,
        normalized_unit_uom: "case",
        normalization_confidence: "medium",
      },
      {
        id: "inc2",
        supplier_id: "s-inc",
        normalized_unit_cost_minor: 7_000,
        normalized_unit_uom: "case",
        normalization_confidence: "medium",
      },
    ];
    const r = compareSupplierNormalizedPrices({
      catalog_product_id: PID,
      offers,
      sellable: null,
      config: baseConfig(),
      incumbent_supplier_id: "s-inc",
      computed_at: fixedNow,
    });
    expect(r.incumbent_min_price_minor).toBe(7_000n);
    expect(r.incumbent_overpriced_vs_market).toBe(true);
    expect(r.flags).not.toContain("no_incumbent");
  });

  it("mixed UOM buckets do not produce fake comparison (only case bucket)", () => {
    const offers: SupplierPriceComparisonInputOffer[] = [
      {
        id: "case-a",
        supplier_id: "s1",
        normalized_unit_cost_minor: 5_000,
        normalized_unit_uom: "case",
        normalization_confidence: "medium",
      },
      {
        id: "each-only",
        supplier_id: "s2",
        normalized_unit_cost_minor: 1,
        normalized_unit_uom: "each",
        normalization_confidence: "high",
      },
    ];
    const r = compareSupplierNormalizedPrices({
      catalog_product_id: PID,
      offers,
      sellable: null,
      config: baseConfig({ allow_derive_case_from_each: false }),
      computed_at: fixedNow,
    });
    expect(r.best_price_minor).toBe(5_000n);
    expect(r.supplier_count).toBe(1);
    expect(r.eligible_offer_count).toBe(1);
  });

  it("excludes offers with missing UOM", () => {
    const offers: SupplierPriceComparisonInputOffer[] = [
      {
        id: "bad",
        supplier_id: "s1",
        normalized_unit_cost_minor: 100,
        normalized_unit_uom: null,
        normalization_confidence: "high",
      },
      {
        id: "good",
        supplier_id: "s2",
        normalized_unit_cost_minor: 200,
        normalized_unit_uom: "case",
        normalization_confidence: "high",
      },
    ];
    const r = compareSupplierNormalizedPrices({
      catalog_product_id: PID,
      offers,
      sellable: null,
      config: baseConfig(),
      computed_at: fixedNow,
    });
    expect(r.best_offer_id).toBe("good");
  });

  it("no case comparable price when only each without derivation", () => {
    const offers: SupplierPriceComparisonInputOffer[] = [
      {
        id: "e1",
        supplier_id: "s1",
        normalized_unit_cost_minor: 100,
        normalized_unit_uom: "each",
        normalization_confidence: "medium",
        pack_qty: 10,
      },
    ];
    const r = compareSupplierNormalizedPrices({
      catalog_product_id: PID,
      offers,
      sellable: { list_price_minor: 1_000 },
      config: baseConfig({ allow_derive_case_from_each: false }),
      computed_at: fixedNow,
    });
    expect(r.best_price_minor).toBeNull();
    expect(r.flags).toContain("no_case_comparable_price");
    expect(r.flags).toContain("baseline_uom_mismatch");
    expect(r.delta_baseline_minor).toBeNull();
  });

  it("config_used echoes config and resolved baseline_field", () => {
    const cfg = baseConfig({ allow_derive_case_from_each: true });
    const r = compareSupplierNormalizedPrices({
      catalog_product_id: PID,
      offers: [
        {
          id: "o1",
          supplier_id: "s1",
          normalized_unit_cost_minor: 1,
          normalized_unit_uom: "case",
          normalization_confidence: "medium",
        },
      ],
      sellable: { list_price_minor: 5 },
      config: cfg,
      computed_at: fixedNow,
    });
    expect(r.config_used.commercial_uom).toBe("case");
    expect(r.config_used.min_confidence).toBe("medium");
    expect(r.config_used.allow_derive_case_from_each).toBe(true);
    expect(r.config_used.baseline_field).toBe("list_price_minor");
    expect(r.commercial_uom).toBe("case");
    expect(r.computed_at).toBe(fixedNow);
  });

  it("inactive offers are excluded", () => {
    const offers: SupplierPriceComparisonInputOffer[] = [
      {
        id: "inactive-cheap",
        supplier_id: "s1",
        normalized_unit_cost_minor: 1,
        normalized_unit_uom: "case",
        normalization_confidence: "high",
        is_active: false,
      },
      {
        id: "active",
        supplier_id: "s2",
        normalized_unit_cost_minor: 9_000,
        normalized_unit_uom: "case",
        normalization_confidence: "high",
      },
    ];
    const r = compareSupplierNormalizedPrices({
      catalog_product_id: PID,
      offers,
      sellable: null,
      config: baseConfig(),
      computed_at: fixedNow,
    });
    expect(r.best_offer_id).toBe("active");
  });
});
