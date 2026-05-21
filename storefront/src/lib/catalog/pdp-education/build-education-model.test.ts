import { describe, expect, it } from "vitest";
import { buildPdpEducationModel } from "@/lib/catalog/pdp-education/build-education-model";

describe("buildPdpEducationModel", () => {
  it("detects disposable family and omits cut tab without cut data", () => {
    const model = buildPdpEducationModel({
      name: "Nitrile 6 mil",
      description: null,
      metadata: { category_slug: "disposable_gloves" },
      specRows: [
        { attribute_key: "material", label: "Material", value: "Nitrile", sort_order: 1 },
        { attribute_key: "thickness_mil", label: "Thickness", value: "6", sort_order: 2 },
        { attribute_key: "uses", label: "Uses", value: "Food prep", sort_order: 3 },
      ],
      commercialRows: [],
      certificationRows: [],
      downloads: [],
    });

    expect(model.family).toBe("disposable");
    expect(model.performance.length).toBeGreaterThan(0);
    expect(model.performance.every((p) => p.level >= 0 && p.level <= 2)).toBe(true);
    expect(model.tabs.some((t) => t.id === "cut-resistance")).toBe(false);
    expect(model.tabs.some((t) => t.id === "overview")).toBe(true);
  });

  it("shows cut tab when ANSI cut is published", () => {
    const model = buildPdpEducationModel({
      name: "HPPE work glove",
      description: null,
      metadata: null,
      specRows: [
        { attribute_key: "cut_level_ansi", label: "Cut level", value: "A4", sort_order: 1 },
        { attribute_key: "coating", label: "Coating", value: "Nitrile", sort_order: 2 },
        { attribute_key: "material", label: "Shell", value: "HPPE", sort_order: 3 },
      ],
      commercialRows: [],
      certificationRows: [{ label: "Cut level", value: "A4" }],
      downloads: [{ label: "Spec sheet", url: "https://example.com/spec.pdf" }],
    });

    expect(model.family).toBe("reusable");
    expect(model.hasCutContext).toBe(true);
    expect(model.tabs.some((t) => t.id === "cut-resistance")).toBe(true);
    expect(model.primaryDownload?.url).toContain("spec.pdf");
  });
});
