import { describe, expect, it } from "vitest";
import { createEmptyFamilyDraft, parseFamilyDraft, applySupplierSkuMirror, syncDraftSizes } from "./draft";
import { suggestFamilyTitle } from "./title";
import { NEW_PRODUCT_FAMILY_SCHEMA } from "./types";

describe("suggestFamilyTitle", () => {
  it("composes brand color material grade and later specs", () => {
    expect(
      suggestFamilyTitle({
        brand: "ProWorks",
        color: "blue_violet",
        material: "nitrile",
        grade: "medical_exam_grade",
      })
    ).toBe("ProWorks Blue-Violet Nitrile Exam Gloves");
    expect(
      suggestFamilyTitle({
        brand: "ProWorks",
        color: "blue_violet",
        material: "nitrile",
        grade: "medical_exam_grade",
        powder: "powder_free",
        thicknessMil: "3",
      })
    ).toBe("ProWorks Blue-Violet Nitrile Exam Gloves, Powder-Free, 3 mil");
  });
});

describe("draft parse / inheritance", () => {
  it("rejects unknown schema", () => {
    expect(parseFamilyDraft({ schemaVersion: "other", brand: "X" })).toBeNull();
  });

  it("round-trips a family draft without inventing cost", () => {
    const d = createEmptyFamilyDraft();
    d.brand = "ProWorks";
    d.schemaVersion = NEW_PRODUCT_FAMILY_SCHEMA;
    const parsed = parseFamilyDraft(JSON.parse(JSON.stringify(d)));
    expect(parsed?.brand).toBe("ProWorks");
    expect(JSON.stringify(parsed)).not.toMatch(/sell_price/);
    expect(JSON.stringify(parsed)).not.toMatch(/normalized_case_cost/);
  });

  it("mirrors supplier SKU from manufacturer when toggle is on", () => {
    let d = syncDraftSizes(createEmptyFamilyDraft(), ["s", "m"]);
    d = {
      ...d,
      supplierSkuMirrorsManufacturer: true,
      variants: {
        ...d.variants,
        s: { ...d.variants.s!, manufacturerSku: "GL-N125F-S", manufacturerConfirmed: true },
      },
    };
    d = applySupplierSkuMirror(d);
    expect(d.variants.s?.supplierSku).toBe("GL-N125F-S");
  });

  it("keeps a distinct supplier SKU when the toggle is off", () => {
    let d = syncDraftSizes(createEmptyFamilyDraft(), ["s"]);
    d = {
      ...d,
      supplierSkuMirrorsManufacturer: false,
      variants: {
        s: {
          size: "s",
          manufacturerSku: "GL-N125F-S",
          supplierSku: "HOS-S",
          manufacturerConfirmed: true,
          suggestedManufacturerSku: null,
        },
      },
    };
    d = applySupplierSkuMirror(d);
    expect(d.variants.s?.supplierSku).toBe("HOS-S");
  });
});
