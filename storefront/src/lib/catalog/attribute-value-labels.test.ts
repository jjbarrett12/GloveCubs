import { describe, expect, it } from "vitest";
import {
  formatAttributeValueLabel,
  getIndustryOptionsForDisplay,
  getStoreIndustryFacetRows,
} from "./attribute-value-labels";

describe("formatAttributeValueLabel", () => {
  it("formats grade slugs", () => {
    expect(formatAttributeValueLabel("grade", "medical_exam_grade")).toBe("Medical Exam Grade");
  });

  it("formats color slugs", () => {
    expect(formatAttributeValueLabel("color", "blue_violet")).toBe("Blue Violet");
  });

  it("formats certification slugs with special casing", () => {
    expect(formatAttributeValueLabel("certifications", "astm_d6319")).toBe("ASTM D6319");
    expect(formatAttributeValueLabel("certifications", "fda_510k")).toBe("FDA 510(k)");
    expect(formatAttributeValueLabel("certifications", "ansi_isea_105")).toBe("ANSI/ISEA 105");
    expect(formatAttributeValueLabel("certifications", "en_388")).toBe("EN 388");
    expect(formatAttributeValueLabel("certifications", "oeko_tex")).toBe("OEKO-TEX");
  });

  it("formats powder slugs", () => {
    expect(formatAttributeValueLabel("powder", "powder_free")).toBe("Powder Free");
  });

  it("formats industry slugs", () => {
    expect(formatAttributeValueLabel("industries", "food_service")).toBe("Food Service");
  });

  it("formats thickness as mil", () => {
    expect(formatAttributeValueLabel("thickness_mil", "0.5")).toBe("0.5 Mil");
    expect(formatAttributeValueLabel("thickness_mil", "3")).toBe("3 Mil");
    expect(formatAttributeValueLabel("thickness_mil", "4")).toBe("4 Mil");
  });

  it("formats material polyethylene slugs", () => {
    expect(formatAttributeValueLabel("material", "polyethylene_pe")).toBe("Polyethylene (PE)");
    expect(formatAttributeValueLabel("material", "polyethylene")).toBe("Polyethylene (PE)");
  });

  it("formats units_per_case with thousands separators", () => {
    expect(formatAttributeValueLabel("units_per_case", "1000")).toBe("1,000");
    expect(formatAttributeValueLabel("units_per_case", "2000")).toBe("2,000");
    expect(formatAttributeValueLabel("units_per_case", "10000")).toBe("10,000");
  });

  it("title-cases unknown slugs", () => {
    expect(formatAttributeValueLabel("grade", "unknown_new_slug")).toBe("Unknown New Slug");
  });

  it("formats commerce packaging numeric facets", () => {
    expect(formatAttributeValueLabel("units_per_case", "1000")).toBe("1,000");
    expect(formatAttributeValueLabel("cases_per_pallet", "84")).toBe("84");
    expect(formatAttributeValueLabel("pallet_pricing_available", "true")).toBe("Yes");
    expect(formatAttributeValueLabel("pallet_pricing_available", "false")).toBe("No");
  });
});

describe("industry alignment", () => {
  it("includes required industry labels without duplicate values", () => {
    const options = getIndustryOptionsForDisplay();
    const values = options.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);

    const labels = new Map(options.map((o) => [o.value, o.label]));
    expect(labels.get("construction")).toBe("Construction");
    expect(labels.get("healthcare")).toBe("Healthcare");
    expect(labels.get("dental")).toBe("Dental");
    expect(labels.get("janitorial")).toBe("Janitorial");
    expect(labels.get("food_service")).toBe("Food Service");
    expect(labels.get("hospitality")).toBe("Hospitality");
    expect(labels.get("plumbing")).toBe("Plumbing");
    expect(labels.get("hvac")).toBe("HVAC");
    expect(labels.get("tattoo_body_art")).toBe("Tattoo");
    expect(labels.get("veterinary")).toBe("Veterinary");
    expect(labels.get("home_use")).toBe("Home Use");
  });

  it("store facet rows derive from canonical labels", () => {
    const rows = getStoreIndustryFacetRows();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.value && r.label)).toBe(true);
    expect(new Set(rows.map((r) => r.value)).size).toBe(rows.length);
  });
});
