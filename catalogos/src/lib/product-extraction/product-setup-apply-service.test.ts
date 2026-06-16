import { describe, expect, it } from "vitest";
import { applyProductSetupCandidatesToNormalizedData } from "./product-setup-apply-service";
import type { ProductSetupApplyCandidateV1 } from "./product-setup-apply-candidates";
import { PRODUCT_SETUP_APPLY_CANDIDATE_SCHEMA_VERSION } from "./product-setup-apply-candidates";

function candidate(
  over: Partial<ProductSetupApplyCandidateV1> & Pick<ProductSetupApplyCandidateV1, "fieldKey" | "mutationKind">
): ProductSetupApplyCandidateV1 {
  return {
    schemaVersion: PRODUCT_SETUP_APPLY_CANDIDATE_SCHEMA_VERSION,
    sectionKey: "identity",
    targetPath: "normalized_data.brand",
    displayValue: "Test",
    applyStatus: "safe_to_apply",
    ...over,
  };
}

describe("applyProductSetupCandidatesToNormalizedData commerce packaging", () => {
  it("updates commerce_packaging without changing unrelated sku_proposals", () => {
    const existingProposals = { schema_version: "catalogos_sku_proposals_v1", proposed_parent_sku: "GLV-X" };
    const nd = {
      category_slug: "disposable_gloves",
      sku_proposals: existingProposals,
      commerce_packaging: {
        schema_version: "commerce_packaging_v1",
        sell_by_case_enabled: true,
        units_per_case: 500,
      },
    };
    const c = candidate({
      fieldKey: "unitsPerCase",
      sectionKey: "commercePackaging",
      mutationKind: "commerce_packaging",
      targetPath: "commerce_packaging.units_per_case",
      extractedValue: "1000",
      applyStatus: "safe_to_apply",
    });
    const result = applyProductSetupCandidatesToNormalizedData(nd, [c]);
    expect(result.appliedFields).toContain("unitsPerCase");
    expect((result.normalizedData.commerce_packaging as { units_per_case?: number }).units_per_case).toBe(1000);
    expect(result.normalizedData.sku_proposals).toEqual(existingProposals);
  });
});
