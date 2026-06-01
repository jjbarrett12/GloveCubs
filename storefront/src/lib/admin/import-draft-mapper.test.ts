import { describe, expect, it } from "vitest";
import { extractImportDraftFromHtml, normalizeSizeCode } from "@/lib/admin/import-draft-mapper";

const SAFETY_ZONE_HTML = `
<html>
<head><title>Safety Zone Nitrile Exam Gloves Medium Blue Violet 3 mil 10x200</title></head>
<body>
<h1>Safety Zone Nitrile Exam Gloves</h1>
<table>
<tr><td>Brand</td><td>Safety Zone</td></tr>
<tr><td>Material</td><td>Nitrile</td></tr>
<tr><td>Color</td><td>Blue Violet</td></tr>
<tr><td>Thickness</td><td>3 mil</td></tr>
<tr><td>Pack Size</td><td>10x200</td></tr>
<tr><td>Size</td><td>Medium</td></tr>
<tr><td>Powder Free</td><td>Yes</td></tr>
<tr><td>Exam Grade</td><td>Yes</td></tr>
</table>
<p>Available in Small, Medium, Large, and XL</p>
</body>
</html>`;

const MULTI_SIZE_HTML = `
<html>
<head><title>Gloves - All Sizes</title></head>
<body>
<p>Available in Small, Medium, Large, and XL</p>
</body>
</html>`;

describe("import-draft-mapper", () => {
  it("parses Safety Zone spec fixture", () => {
    const draft = extractImportDraftFromHtml(SAFETY_ZONE_HTML, "https://example.com/glove");
    expect(draft.product_name).toMatch(/Safety Zone/i);
    expect(draft.brand).toBe("Safety Zone");
    expect(draft.material).toBe("nitrile");
    expect(draft.color).toBe("Blue Violet");
    expect(draft.thickness_mil).toBe(3);
    expect(draft.case_pack).toBe("10/200");
    expect(draft.units_per_case).toBe(2000);
    expect(draft.powder_free).toBe(true);
    expect(draft.exam_grade).toBe(true);
    expect(draft.glove_grade).toBe("medical_exam_grade");
    expect(draft.variants.some((v) => v.normalized_size_code === "M")).toBe(true);
  });

  it("normalizes Medium to M", () => {
    expect(normalizeSizeCode("Medium")).toBe("M");
  });

  it("infers brand and color from title when spec table lacks them", () => {
    const html = `
      <html>
      <head><title>Safety Zone® Blue Violet Nitrile Exam Gloves 3 mil M</title></head>
      <body><h1>Safety Zone® Blue Violet Nitrile Exam Gloves</h1></body>
      </html>`;
    const draft = extractImportDraftFromHtml(html, "https://example.com/glove");
    expect(draft.brand).toBe("Safety Zone");
    expect(draft.color).toBe("Blue Violet");
  });

  it("creates multiple variants when page lists multiple sizes", () => {
    const draft = extractImportDraftFromHtml(MULTI_SIZE_HTML, "https://example.com/glove");
    expect(draft.variants.length).toBeGreaterThan(1);
    const codes = draft.variants.map((v) => v.normalized_size_code);
    expect(codes).toContain("S");
    expect(codes).toContain("M");
    expect(codes).toContain("L");
    expect(codes).toContain("XL");
  });

  it("creates variant when only one size is listed in text", () => {
    const html = `
      <html><body><p>Size: Large only</p></body></html>`;
    const draft = extractImportDraftFromHtml(html, "https://example.com/glove");
    expect(draft.variants.length).toBeGreaterThanOrEqual(1);
    expect(draft.variants.some((v) => v.normalized_size_code === "L")).toBe(true);
  });
});
