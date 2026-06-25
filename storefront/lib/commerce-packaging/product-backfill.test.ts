import { describe, expect, it } from "vitest";
import {
  inferProductBackfillPlan,
  mergeMetadataForBackfill,
  parseLegacyCasePack,
} from "./product-backfill";
import { COMMERCE_PACKAGING_SCHEMA_VERSION } from "./types";
import { normalizeCommercePackaging } from "./labels";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";

function existingCommerce(unitsPerCase = 500) {
  return {
    commerce_packaging: {
      schema_version: COMMERCE_PACKAGING_SCHEMA_VERSION,
      units_per_case: unitsPerCase,
      inner_unit_type: "box",
      units_per_inner: 100,
      inners_per_case: 5,
      unit_noun: "gloves",
    },
  };
}

describe("parseLegacyCasePack", () => {
  it("maps 10/100 to box inner breakdown", () => {
    expect(parseLegacyCasePack("10/100")).toEqual({
      inner_unit_type: "box",
      units_per_inner: 100,
      inners_per_case: 10,
    });
  });

  it("maps 4/250 to box inner breakdown", () => {
    expect(parseLegacyCasePack("4/250")).toEqual({
      inner_unit_type: "box",
      units_per_inner: 250,
      inners_per_case: 4,
    });
  });

  it("maps 6 dozen to dozen inner breakdown", () => {
    expect(parseLegacyCasePack("6 dozen")).toEqual({
      inner_unit_type: "dozen",
      units_per_inner: 12,
      inners_per_case: 6,
    });
  });
});

describe("inferProductBackfillPlan", () => {
  it("skips products that already have commerce_packaging", () => {
    const plan = inferProductBackfillPlan({
      id: PRODUCT_ID,
      metadata: existingCommerce(),
    });
    expect(plan.recommendedAction).toBe("skip_has_commerce");
    expect(plan.commercePackaging).toBeNull();
  });

  it("does not skip existing commerce_packaging when force is true", () => {
    const plan = inferProductBackfillPlan(
      {
        id: PRODUCT_ID,
        metadata: {
          ...existingCommerce(500),
          units_per_case: 1000,
          case_pack: "10/100",
        },
      },
      { force: true }
    );
    expect(plan.recommendedAction).toBe("safe_backfill");
    expect(plan.inferredUnitsPerCase).toBe(1000);
  });

  it("maps legacy units_per_case only with inner fields null", () => {
    const plan = inferProductBackfillPlan({
      id: PRODUCT_ID,
      metadata: { units_per_case: 1000, category_slug: "disposable_gloves" },
    });
    expect(plan.recommendedAction).toBe("safe_backfill");
    expect(plan.inferredUnitsPerCase).toBe(1000);
    expect(plan.commercePackaging?.units_per_inner).toBeNull();
    expect(plan.commercePackaging?.inners_per_case).toBeNull();
  });

  it("maps legacy case_pack 10/100 to 1000 units per case", () => {
    const plan = inferProductBackfillPlan({
      id: PRODUCT_ID,
      metadata: { case_pack: "10/100", category_slug: "disposable_gloves" },
    });
    expect(plan.recommendedAction).toBe("safe_backfill");
    expect(plan.inferredUnitsPerCase).toBe(1000);
    expect(plan.inferredInnerUnitType).toBe("box");
    expect(plan.inferredUnitsPerInner).toBe(100);
    expect(plan.inferredInnersPerCase).toBe(10);
  });

  it("maps legacy case_pack 4/250 to 1000 units per case", () => {
    const plan = inferProductBackfillPlan({
      id: PRODUCT_ID,
      metadata: { case_pack: "4/250", category_slug: "disposable_gloves" },
    });
    expect(plan.inferredUnitsPerCase).toBe(1000);
  });

  it("marks missing legacy data as manual_review", () => {
    const plan = inferProductBackfillPlan({
      id: PRODUCT_ID,
      metadata: { name: "Mystery glove" },
    });
    expect(plan.recommendedAction).toBe("manual_review");
    expect(plan.commercePackaging).toBeNull();
  });

  it("does not invent cases_per_pallet or pallet_price", () => {
    const plan = inferProductBackfillPlan({
      id: PRODUCT_ID,
      metadata: { case_pack: "10/100", category_slug: "disposable_gloves" },
    });
    expect(plan.commercePackaging?.cases_per_pallet).toBeNull();
    expect(plan.commercePackaging?.pallet_price).toBeNull();
  });
});

describe("mergeMetadataForBackfill", () => {
  it("preserves existing metadata keys", () => {
    const cp = normalizeCommercePackaging(
      {
        inner_unit_type: "box",
        units_per_inner: 100,
        inners_per_case: 10,
        unit_noun: "gloves",
      },
      "disposable_gloves"
    );
    const merged = mergeMetadataForBackfill(
      { brand: "Proworks", custom_field: "keep-me" },
      cp
    );
    expect(merged.brand).toBe("Proworks");
    expect(merged.custom_field).toBe("keep-me");
    expect(merged.commerce_packaging).toBeDefined();
    expect(merged.units_per_case).toBe(1000);
    expect(merged.case_pack).toBe("10/100");
  });

  it("writes commerce_packaging and derived packaging_summary mirror", () => {
    const cp = normalizeCommercePackaging(
      { units_per_case: 1000, unit_noun: "gloves" },
      "disposable_gloves"
    );
    const merged = mergeMetadataForBackfill({ packaging_summary: "old summary" }, cp);
    expect((merged.commerce_packaging as { schema_version: number }).schema_version).toBe(
      COMMERCE_PACKAGING_SCHEMA_VERSION
    );
    expect(merged.packaging_summary).toBe("1,000 gloves per case");
  });
});
