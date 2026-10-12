import { describe, expect, it } from "vitest";
import { createEmptyFamilyDraft, syncDraftSizes } from "./draft";
import { derivedUnitsPerCase, evaluateFamilyPackaging, packagingForSize } from "./packaging";

describe("family packaging", () => {
  it("calculates 200 × 10 = 2000", () => {
    expect(derivedUnitsPerCase({ unitsPerInner: 200, innersPerCase: 10 })).toBe(2000);
  });

  it("applies shared packaging to every size", () => {
    const draft = {
      ...syncDraftSizes(createEmptyFamilyDraft(), ["s", "m", "l"]),
      samePackagingForAllSizes: true,
      packaging: { unitsPerInner: 200, innersPerCase: 10 },
    };
    expect(packagingForSize(draft, "s")).toEqual(draft.packaging);
    expect(packagingForSize(draft, "m")).toEqual(draft.packaging);
    expect(evaluateFamilyPackaging(draft).complete).toBe(true);
    expect(evaluateFamilyPackaging(draft).unitsPerCase).toBe(2000);
  });

  it("accepts 100, 250, and 500 glove boxes when the case facet can be derived", () => {
    const base = {
      ...syncDraftSizes(createEmptyFamilyDraft(), ["s", "m", "l", "xl"]),
      samePackagingForAllSizes: true,
    };
    expect(evaluateFamilyPackaging({ ...base, packaging: { unitsPerInner: 100, innersPerCase: 10 } }).unitsPerCase).toBe(1000);
    expect(evaluateFamilyPackaging({ ...base, packaging: { unitsPerInner: 250, innersPerCase: 4 } }).complete).toBe(true);
    expect(evaluateFamilyPackaging({ ...base, packaging: { unitsPerInner: 500, innersPerCase: 10 } }).unitsPerCase).toBe(5000);
    const single500 = evaluateFamilyPackaging({ ...base, packaging: { unitsPerInner: 500, innersPerCase: 1 } });
    expect(single500.complete).toBe(false);
    expect(single500.blockReason).toMatch(/packaging facet/i);
  });

  it("rejects a non-positive box count", () => {
    const draft = {
      ...syncDraftSizes(createEmptyFamilyDraft(), ["m"]),
      packaging: { unitsPerInner: 0, innersPerCase: 10 },
    };
    expect(evaluateFamilyPackaging(draft).complete).toBe(false);
    expect(evaluateFamilyPackaging(draft).blockReason).toMatch(/gloves per box/i);
  });

  it("requires per-size pack when the shared toggle is off", () => {
    const draft = {
      ...syncDraftSizes(createEmptyFamilyDraft(), ["s", "m"]),
      samePackagingForAllSizes: false,
      packaging: { unitsPerInner: 200, innersPerCase: 10 },
      packagingBySize: {
        s: { unitsPerInner: 200, innersPerCase: 10 },
      },
    };
    expect(evaluateFamilyPackaging(draft).complete).toBe(false);
    expect(evaluateFamilyPackaging(draft).blockReason).toMatch(/M:/i);
  });
});
