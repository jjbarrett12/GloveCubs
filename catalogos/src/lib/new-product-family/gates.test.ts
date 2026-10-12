import { describe, expect, it } from "vitest";
import { createEmptyFamilyDraft, syncDraftSizes } from "./draft";
import {
  deriveFamilyGloveCubsSkus,
  duplicateManufacturerSkus,
} from "./sku-assist";
import {
  evaluateIdentityStep,
  evaluatePackagingStep,
  evaluateSizeFamilyStep,
  evaluateSpecificationsStep,
  canVisitStep,
} from "./gates";
import type { NewProductFamilyDraft } from "./types";

const NO_COLLISIONS = { existingParentSkus: new Set<string>(), existingVariantSkus: new Set<string>() };

function withIdentity(draft: NewProductFamilyDraft = createEmptyFamilyDraft()): NewProductFamilyDraft {
  return {
    ...draft,
    brand: "ProWorks",
    material: "nitrile",
    grade: "medical_exam_grade",
    color: "blue_violet",
    title: "ProWorks Blue-Violet Nitrile Exam Gloves",
  };
}

function withSpecs(draft: NewProductFamilyDraft): NewProductFamilyDraft {
  return { ...draft, powder: "powder_free", thicknessMil: "3" };
}

function confirmSize(draft: NewProductFamilyDraft, size: "xs" | "s" | "m" | "l" | "xl", sku: string): NewProductFamilyDraft {
  return {
    ...draft,
    variants: {
      ...draft.variants,
      [size]: {
        size,
        manufacturerSku: sku,
        supplierSku: sku,
        manufacturerConfirmed: true,
        suggestedManufacturerSku: null,
      },
    },
  };
}

describe("step gates", () => {
  it("blocks identity until required fields are set", () => {
    const empty = evaluateIdentityStep(createEmptyFamilyDraft());
    expect(empty.canAdvance).toBe(false);
    expect(empty.blockReason).toMatch(/brand/i);
    const ident = evaluateIdentityStep(withIdentity());
    expect(ident.canAdvance).toBe(true);
  });

  it("blocks specifications without powder or thickness", () => {
    const ident = withIdentity();
    expect(evaluateSpecificationsStep(ident).canAdvance).toBe(false);
    expect(evaluateSpecificationsStep(ident).blockReason).toMatch(/powder/i);
    expect(evaluateSpecificationsStep({ ...ident, powder: "powder_free" }).blockReason).toMatch(/thickness/i);
    expect(evaluateSpecificationsStep(withSpecs(ident)).canAdvance).toBe(true);
  });

  it("does not treat optional texture as required", () => {
    expect(evaluateSpecificationsStep(withSpecs(withIdentity())).canAdvance).toBe(true);
  });

  it("blocks size family with no sizes, unconfirmed SKUs, duplicates, or collisions", () => {
    const base = withSpecs(withIdentity());
    expect(evaluateSizeFamilyStep({ ...base, sizes: [] }, NO_COLLISIONS).blockReason).toMatch(/size/i);

    const sized = syncDraftSizes(base, ["s", "m"]);
    expect(evaluateSizeFamilyStep(sized, NO_COLLISIONS).blockReason).toMatch(/manufacturer SKU/i);

    const suggested = {
      ...sized,
      variants: {
        ...sized.variants,
        s: { ...sized.variants.s!, manufacturerSku: "GL-N125F-S", manufacturerConfirmed: false },
      },
    };
    expect(evaluateSizeFamilyStep(suggested, NO_COLLISIONS).blockReason).toMatch(/manufacturer SKU for Small/);

    let confirmed = confirmSize(sized, "s", "GL-N125F-S");
    confirmed = confirmSize(confirmed, "m", "GL-N125F-S");
    expect(duplicateManufacturerSkus(confirmed).length).toBeGreaterThan(0);
    expect(evaluateSizeFamilyStep(confirmed, NO_COLLISIONS).blockReason).toMatch(/more than one size/);

    let unique = confirmSize(sized, "s", "GL-N125F-S");
    unique = confirmSize(unique, "m", "GL-N125F-M");
    expect(evaluateSizeFamilyStep(unique, NO_COLLISIONS).canAdvance).toBe(true);

    const derived = deriveFamilyGloveCubsSkus(unique);
    const collision = evaluateSizeFamilyStep(unique, {
      existingParentSkus: new Set(),
      existingVariantSkus: new Set([derived.bySize.s!]),
    });
    expect(collision.canAdvance).toBe(false);
    expect(collision.blockReason).toMatch(/already exists/i);
  });

  it("blocks packaging until gloves/box and boxes/case are set, then accepts 200 × 10", () => {
    const d = withSpecs(withIdentity());
    expect(evaluatePackagingStep(d).canAdvance).toBe(false);
    expect(evaluatePackagingStep(d).blockReason).toMatch(/gloves per box/i);
    const packed = { ...d, packaging: { unitsPerInner: 200, innersPerCase: 10 } };
    expect(evaluatePackagingStep(packed).canAdvance).toBe(true);
  });

  it("cannot skip to size family before identity and specs are complete", () => {
    expect(canVisitStep(createEmptyFamilyDraft(), 3, NO_COLLISIONS)).toBe(false);
    expect(canVisitStep(withSpecs(withIdentity()), 3, NO_COLLISIONS)).toBe(true);
    expect(canVisitStep(withSpecs(withIdentity()), 5, NO_COLLISIONS)).toBe(false);
  });
});
