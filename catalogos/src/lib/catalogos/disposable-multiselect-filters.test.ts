/**
 * Disposable multi-select: certifications (canonical), uses, protection_tags;
 * legacy compliance_certifications merges into certifications.
 */

import { describe, expect, it } from "vitest";
import { normalizeFilterAttributesKeys } from "./attribute-validation";
import { parseSafe } from "./validation-modes";

const minimalContent = {
  canonical_title: "Nitrile exam glove",
  supplier_sku: "TST-100",
  supplier_cost: 12.5,
};

describe("disposable multi-select filters", () => {
  it("normalizeFilterAttributesKeys merges compliance_certifications into certifications", () => {
    const m = normalizeFilterAttributesKeys({
      compliance_certifications: ["fda_approved", "astm_tested"],
      certifications: ["en_455"],
    });
    expect(new Set(m.certifications as string[])).toEqual(new Set(["fda_approved", "astm_tested", "en_455"]));
    expect(m).not.toHaveProperty("compliance_certifications");
  });

  it("parseSafe accepts multiple certifications, uses, and protection_tags", () => {
    const r = parseSafe({
      content: minimalContent,
      category_slug: "disposable_gloves",
      filter_attributes: {
        certifications: ["fda_approved", "latex_free"],
        uses: ["medical_exam", "food_handling"],
        protection_tags: ["chemical_resistant", "viral_barrier"],
      },
    });
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("parseSafe merges legacy compliance_certifications into certifications before validation", () => {
    const r = parseSafe({
      content: minimalContent,
      category_slug: "disposable_gloves",
      filter_attributes: {
        compliance_certifications: ["en_374"],
        certifications: ["fda_approved"],
      },
    });
    expect(r.valid).toBe(true);
  });
});
