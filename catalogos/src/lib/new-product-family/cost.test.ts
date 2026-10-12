import { describe, expect, it } from "vitest";
import { createEmptyFamilyDraft, syncDraftSizes } from "./draft";
import { evaluateFamilyCost } from "./cost";
import type { NewProductFamilyDraft } from "./types";

const SUPPLIER = "550e8400-e29b-41d4-a716-446655440000";

function costDraft(patch: Partial<NewProductFamilyDraft> = {}): NewProductFamilyDraft {
  return {
    ...syncDraftSizes(createEmptyFamilyDraft(), ["s", "m"]),
    supplierId: SUPPLIER,
    costSourceType: "supplier_quote",
    costSourceReference: "Q-100",
    quotedCaseCost: 40,
    landedCaseCost: 48,
    landedCostConfirmed: true,
    ...patch,
  };
}

describe("family cost trust", () => {
  it("keeps quoted cost separate from landed cost and requires confirmation", () => {
    const unconfirmed = evaluateFamilyCost(costDraft({ landedCostConfirmed: false }));
    expect(unconfirmed.trusted).toBe(false);
    expect(unconfirmed.bySize.s?.quotedCaseCost).toBe(40);
    expect(unconfirmed.bySize.s?.landedCaseCost).toBe(48);
    expect(unconfirmed.blockReason).toMatch(/not be published as a customer price/i);

    const missingLanded = evaluateFamilyCost(costDraft({ landedCaseCost: null }));
    expect(missingLanded.trusted).toBe(false);
    expect(missingLanded.blockReason).toMatch(/landed case cost/i);

    const trusted = evaluateFamilyCost(costDraft());
    expect(trusted.trusted).toBe(true);
    expect(trusted.bySize.m).toEqual({ quotedCaseCost: 40, landedCaseCost: 48 });
  });

  it("does not treat a missing supplier as a cost", () => {
    const result = evaluateFamilyCost(costDraft({ supplierId: null }));
    expect(result.complete).toBe(false);
    expect(result.blockReason).toMatch(/supplier/i);
  });
});
