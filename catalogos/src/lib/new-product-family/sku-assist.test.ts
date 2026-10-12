import { describe, expect, it } from "vitest";
import { createEmptyFamilyDraft, syncDraftSizes } from "./draft";
import {
  acceptAllManufacturerSuggestions,
  applyManufacturerSuggestions,
  collectStagedGloveCubsSkus,
  skusOwnedByOthers,
  deriveFamilyGloveCubsSkus,
  manufacturerSkuStatus,
  suggestManufacturerSkusFromExample,
} from "./sku-assist";

describe("manufacturer SKU assist", () => {
  it("suggests remaining hyphenated sizes without confirming them", () => {
    const result = suggestManufacturerSkusFromExample("GL-N125F-S", ["xs", "s", "m", "l", "xl"]);
    expect(result.parsed).toBe(true);
    expect(result.exampleSize).toBe("s");
    expect(result.suggestions.xs).toBe("GL-N125F-XS");
    expect(result.suggestions.m).toBe("GL-N125F-M");
    expect(result.suggestions.l).toBe("GL-N125F-L");
    expect(result.suggestions.xl).toBe("GL-N125F-XL");
  });

  it("does not invent SKUs when inference fails", () => {
    const result = suggestManufacturerSkusFromExample("???", ["s", "m", "l"]);
    expect(result.parsed).toBe(false);
    expect(result.suggestions).toEqual({});
  });

  it("keeps suggestions unconfirmed until accept-all", () => {
    let draft = syncDraftSizes(createEmptyFamilyDraft(), ["s", "m", "l"]);
    const result = suggestManufacturerSkusFromExample("GL-N125F-S", draft.sizes);
    draft = applyManufacturerSuggestions(draft, result.suggestions, result.exampleSize);
    expect(manufacturerSkuStatus(draft.variants.s!)).toBe("confirmed");
    expect(manufacturerSkuStatus(draft.variants.m!)).toBe("suggested");
    expect(draft.variants.m?.manufacturerConfirmed).toBe(false);
    draft = acceptAllManufacturerSuggestions(draft);
    expect(manufacturerSkuStatus(draft.variants.m!)).toBe("confirmed");
    expect(manufacturerSkuStatus(draft.variants.l!)).toBe("confirmed");
  });

  it("generates GloveCubs SKUs from confirmed manufacturer SKUs", () => {
    let draft = syncDraftSizes(createEmptyFamilyDraft(), ["s", "m"]);
    draft = {
      ...draft,
      variants: {
        s: {
          size: "s",
          manufacturerSku: "GL-N125F-S",
          supplierSku: "GL-N125F-S",
          manufacturerConfirmed: true,
          suggestedManufacturerSku: null,
        },
        m: {
          size: "m",
          manufacturerSku: "GL-N125F-M",
          supplierSku: "GL-N125F-M",
          manufacturerConfirmed: true,
          suggestedManufacturerSku: null,
        },
      },
    };
    const derived = deriveFamilyGloveCubsSkus(draft);
    expect(derived.parentSku).toMatch(/^GLV-/);
    expect(derived.bySize.s).toMatch(/^GLV-/);
    expect(derived.bySize.s).not.toBe("GL-N125F-S");
    expect(derived.bySize.m).not.toBe("GL-N125F-M");
  });

  it("treats staged GloveCubs SKUs as collisions and ignores supplier item numbers", () => {
    const collected = collectStagedGloveCubsSkus([
      {
        inferred_base_sku: "glv-parent",
        normalized_data: {
          sku: "glv-parent-s",
          supplier_sku: "SUP-ONLY",
          sku_proposals: {
            applied_parent_sku: "glv-parent",
            applied_variant_skus: { M: "glv-parent-m" },
          },
        },
      },
    ]);
    expect(collected.parentSkus).toEqual(["GLV-PARENT", "GLV-PARENT"]);
    expect(collected.variantSkus).toEqual(["GLV-PARENT-S", "GLV-PARENT-M"]);
    expect(collected.variantSkus).not.toContain("SUP-ONLY");
  });

  it("keeps another family's SKU and drops SKUs that belong only to this draft", () => {
    expect(
      skusOwnedByOthers([
        { sku: "GLV-GL-N125", ownedByDraft: true },
        { sku: "glv-gl-n125s", ownedByDraft: true },
        { sku: "GLV-OTHER", ownedByDraft: false },
        { sku: "GLV-GL-N125", ownedByDraft: false },
      ])
    ).toEqual(["GLV-OTHER", "GLV-GL-N125"]);
  });
});
