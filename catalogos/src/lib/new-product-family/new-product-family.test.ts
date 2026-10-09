import { describe, expect, it } from "vitest";
import {
  acceptAllManufacturerSuggestions,
  applyExampleManufacturerSku,
  applyGradeChange,
  applySupplierSkuMirror,
  completedPhase1StepCount,
  createEmptyFamilyDraft,
  deriveFamilyGloveCubsSkus,
  derivedUnitsPerCase,
  duplicateManufacturerSkus,
  effectiveSupplierSku,
  EMPTY_SKU_COLLISIONS,
  evaluateIdentityStep,
  evaluatePackagingStep,
  evaluateSizeFamilyStep,
  evaluateSpecificationsStep,
  nextBlockReason,
  parseFamilyDraft,
  refreshSuggestedTitle,
  suggestFamilyTitle,
  suggestManufacturerSkusFromExample,
  syncDraftSizes,
  XS_XL_FAMILY_SIZES,
} from "./index";
import type { NewProductFamilyDraft } from "./types";
import { NEW_PRODUCT_FAMILY_SCHEMA } from "./types";

function identityDraft(overrides: Partial<NewProductFamilyDraft> = {}): NewProductFamilyDraft {
  const base = {
    ...createEmptyFamilyDraft(),
    brand: "ProWorks",
    material: "nitrile",
    grade: "medical_exam_grade",
    color: "blue_violet",
  };
  const titled = { ...base, ...refreshSuggestedTitle(base) };
  return { ...titled, ...overrides };
}

function specsDraft(overrides: Partial<NewProductFamilyDraft> = {}): NewProductFamilyDraft {
  return identityDraft({ powder: "powder_free", thicknessMil: "3", ...overrides });
}

function sizedDraft(): NewProductFamilyDraft {
  let draft = syncDraftSizes(specsDraft(), [...XS_XL_FAMILY_SIZES]);
  draft = applyExampleManufacturerSku(draft, "GL-N125F-S");
  return acceptAllManufacturerSuggestions(draft);
}

function packedDraft(overrides: Partial<NewProductFamilyDraft> = {}): NewProductFamilyDraft {
  return {
    ...sizedDraft(),
    packaging: { unitsPerInner: 200, innersPerCase: 10 },
    ...overrides,
  };
}

describe("identity", () => {
  it("blocks Next when required fields are incomplete", () => {
    expect(evaluateIdentityStep(createEmptyFamilyDraft()).blockReason).toBe("Select a brand to continue.");
    expect(evaluateIdentityStep(identityDraft({ material: "" })).blockReason).toBe("Select a material to continue.");
    expect(evaluateIdentityStep(identityDraft({ grade: "" })).blockReason).toBe("Select a grade to continue.");
    expect(evaluateIdentityStep(identityDraft({ color: "" })).blockReason).toBe("Select a color to continue.");
    expect(evaluateIdentityStep(identityDraft({ title: "", titleTouched: true })).blockReason).toBe(
      "Enter a display title to continue."
    );
  });

  it("allows Next when identity is complete", () => {
    const gate = evaluateIdentityStep(identityDraft());
    expect(gate.canAdvance).toBe(true);
    expect(gate.complete).toBe(true);
  });

  it("suggests title from structured identity", () => {
    expect(
      suggestFamilyTitle({
        brand: "ProWorks",
        color: "blue_violet",
        material: "nitrile",
        grade: "medical_exam_grade",
      })
    ).toBe("ProWorks Blue-Violet Nitrile Exam Gloves");
  });

  it("refreshes title when powder and thickness are added", () => {
    const suggested = suggestFamilyTitle({
      brand: "ProWorks",
      color: "blue_violet",
      material: "nitrile",
      grade: "medical_exam_grade",
      powder: "powder_free",
      thicknessMil: "3",
    });
    expect(suggested).toContain("Powder-Free");
    expect(suggested).toContain("3 mil");
  });

  it("rejects unsupported canonical material", () => {
    const gate = evaluateIdentityStep(identityDraft({ material: "cotton" }));
    expect(gate.canAdvance).toBe(false);
    expect(gate.blockReason).toBe("Select a material to continue.");
  });
});

describe("specifications", () => {
  it("blocks when powder is missing", () => {
    expect(evaluateSpecificationsStep(identityDraft()).blockReason).toBe("Select powder status to continue.");
  });

  it("blocks when thickness is missing", () => {
    expect(evaluateSpecificationsStep(identityDraft({ powder: "powder_free" })).blockReason).toBe(
      "Select thickness to continue."
    );
  });

  it("blocks unsupported thickness", () => {
    expect(evaluateSpecificationsStep(identityDraft({ powder: "powder_free", thicknessMil: "2.5" })).canAdvance).toBe(
      false
    );
  });

  it("allows valid specs without optional texture", () => {
    const gate = evaluateSpecificationsStep(specsDraft({ texture: "" }));
    expect(gate.canAdvance).toBe(true);
  });

  it("clears medical-only fields when grade leaves medical", () => {
    const medical = specsDraft({
      aql: "aql_1_5",
      sterility: "non_sterile",
      certifications: ["fda_510k"],
    });
    const industrial = applyGradeChange(medical, "industrial_grade");
    expect(industrial.aql).toBe("");
    expect(industrial.sterility).toBe("");
    expect(industrial.certifications).toEqual([]);
  });
});

describe("size family", () => {
  it("blocks when no size is selected", () => {
    expect(evaluateSizeFamilyStep(specsDraft(), EMPTY_SKU_COLLISIONS).blockReason).toBe(
      "Select at least one size to continue."
    );
  });

  it("creates five rows for XS–XL", () => {
    const draft = syncDraftSizes(specsDraft(), [...XS_XL_FAMILY_SIZES]);
    expect(draft.sizes).toEqual(["xs", "s", "m", "l", "xl"]);
    expect(Object.keys(draft.variants)).toHaveLength(5);
  });

  it("blocks unconfirmed SKU suggestions", () => {
    let draft = syncDraftSizes(specsDraft(), [...XS_XL_FAMILY_SIZES]);
    draft = applyExampleManufacturerSku(draft, "GL-N125F-S");
    expect(draft.variants.s?.manufacturerConfirmed).toBe(true);
    expect(draft.variants.m?.manufacturerConfirmed).toBe(false);
    expect(draft.variants.m?.manufacturerSku).toBe("GL-N125F-M");
    const gate = evaluateSizeFamilyStep(draft, EMPTY_SKU_COLLISIONS);
    expect(gate.canAdvance).toBe(false);
    expect(gate.blockReason).toMatch(/Confirm the manufacturer SKU for XS/);
  });

  it("accepts all suggestions", () => {
    let draft = syncDraftSizes(specsDraft(), [...XS_XL_FAMILY_SIZES]);
    draft = applyExampleManufacturerSku(draft, "GL-N125F-S");
    draft = acceptAllManufacturerSuggestions(draft);
    expect(draft.sizes.every((size) => draft.variants[size]?.manufacturerConfirmed)).toBe(true);
    expect(evaluateSizeFamilyStep(draft, EMPTY_SKU_COLLISIONS).canAdvance).toBe(true);
  });

  it("blocks duplicate manufacturer SKUs", () => {
    let draft = sizedDraft();
    draft = {
      ...draft,
      variants: {
        ...draft.variants,
        m: { ...draft.variants.m!, manufacturerSku: "GL-N125F-S", manufacturerConfirmed: true },
      },
    };
    expect(duplicateManufacturerSkus(draft)).toContain("GL-N125F-S");
    expect(evaluateSizeFamilyStep(draft, EMPTY_SKU_COLLISIONS).canAdvance).toBe(false);
  });

  it("blocks generated GloveCubs SKU collisions", () => {
    const draft = sizedDraft();
    const derived = deriveFamilyGloveCubsSkus(draft);
    const colliding = derived.bySize.m;
    expect(colliding).toBeTruthy();
    const gate = evaluateSizeFamilyStep(draft, {
      existingParentSkus: new Set(),
      existingVariantSkus: new Set([colliding!]),
    });
    expect(gate.canAdvance).toBe(false);
    expect(gate.blockReason).toMatch(/already exists/i);
  });

  it("mirrors supplier SKU from manufacturer and allows distinct values when off", () => {
    let draft = sizedDraft();
    draft = applySupplierSkuMirror({ ...draft, supplierSkuMirrorsManufacturer: true });
    expect(effectiveSupplierSku(draft, "m")).toBe(draft.variants.m?.manufacturerSku);
    draft = {
      ...draft,
      supplierSkuMirrorsManufacturer: false,
      variants: {
        ...draft.variants,
        m: { ...draft.variants.m!, supplierSku: "SUP-M" },
      },
    };
    expect(effectiveSupplierSku(draft, "m")).toBe("SUP-M");
  });

  it("does not invent SKUs when the pattern is not safely inferable", () => {
    const result = suggestManufacturerSkusFromExample("ABC", [...XS_XL_FAMILY_SIZES]);
    expect(result.parsed).toBe(false);
    expect(result.suggestions).toEqual({});
  });
});

describe("packaging", () => {
  it("calculates 200 × 10 = 2,000", () => {
    expect(derivedUnitsPerCase({ unitsPerInner: 200, innersPerCase: 10 })).toBe(2000);
  });

  it("applies shared packaging to all sizes", () => {
    const draft = packedDraft();
    expect(evaluatePackagingStep(draft).canAdvance).toBe(true);
    expect(draft.samePackagingForAllSizes).toBe(true);
  });

  it("blocks custom invalid integers", () => {
    expect(evaluatePackagingStep(packedDraft({ packaging: { unitsPerInner: 0, innersPerCase: 10 } })).canAdvance).toBe(
      false
    );
    expect(
      evaluatePackagingStep(packedDraft({ packaging: { unitsPerInner: 1.5, innersPerCase: 10 } })).canAdvance
    ).toBe(false);
  });

  it("requires every size when packaging is per-size", () => {
    const draft = packedDraft({
      samePackagingForAllSizes: false,
      packagingBySize: {
        xs: { unitsPerInner: 200, innersPerCase: 10 },
        s: { unitsPerInner: 200, innersPerCase: 10 },
      },
    });
    expect(evaluatePackagingStep(draft).canAdvance).toBe(false);
    expect(evaluatePackagingStep(draft).blockReason).toMatch(/Choose gloves per box/);
  });
});

describe("draft save/resume", () => {
  it("round-trips identity, specs, sizes, SKU confirmations, and packaging", () => {
    const saved = packedDraft();
    const restored = parseFamilyDraft(JSON.parse(JSON.stringify(saved)));
    expect(restored).not.toBeNull();
    expect(restored?.schemaVersion).toBe(NEW_PRODUCT_FAMILY_SCHEMA);
    expect(restored?.brand).toBe("ProWorks");
    expect(restored?.powder).toBe("powder_free");
    expect(restored?.sizes).toEqual(["xs", "s", "m", "l", "xl"]);
    expect(restored?.variants.m?.manufacturerConfirmed).toBe(true);
    expect(restored?.variants.m?.manufacturerSku).toBe("GL-N125F-M");
    expect(restored?.packaging).toEqual({ unitsPerInner: 200, innersPerCase: 10 });
    expect(completedPhase1StepCount(restored!, EMPTY_SKU_COLLISIONS)).toBe(4);
  });

  it("rejects unknown schemas", () => {
    expect(parseFamilyDraft({ schemaVersion: "other", brand: "ProWorks" })).toBeNull();
  });
});

describe("phase lock", () => {
  it("leaves packaging when it is complete and blocks supplier cost until a supplier is chosen", () => {
    expect(nextBlockReason(packedDraft(), 4, EMPTY_SKU_COLLISIONS)).toBeNull();
    expect(nextBlockReason(packedDraft(), 5, EMPTY_SKU_COLLISIONS)).toMatch(/supplier/i);
  });
});
