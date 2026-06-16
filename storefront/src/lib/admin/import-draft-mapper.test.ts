import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  buildImportDraftVariants,
  extractImportDraftFromHtml,
  normalizeSizeCode,
} from "@/lib/admin/import-draft-mapper";
import { extractProductFromHtml } from "@/lib/admin/productExtraction";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
<ul>
<li>Standard: Meets ASTM D6319, Complies with FDA CFR Title 21 Indirect Food Additive Regulations Part 177</li>
</ul>
<div class="product-gallery">
  <img src="https://cdn.example.com/glove-main.jpg" />
  <img src="https://cdn.example.com/glove-box.jpg" />
  <img src="https://cdn.example.com/glove-wear.jpg" />
  <img src="https://cdn.example.com/glove-detail.jpg" />
</div>
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
    // Flat draft fields are canonical; nested commerce_packaging may be absent when only spec-table case pack is parsed.
    expect(draft.box_quantity).toBe("200");
    expect(draft.case_quantity).toBe("2000");
    expect(draft.certification_slugs).toEqual(
      expect.arrayContaining(["astm_d6319", "fda_food_contact"])
    );
    expect(draft.food_safe).toBe(true);
    expect(draft.image_urls).toHaveLength(4);
    expect(draft.image_url).toBe("https://cdn.example.com/glove-main.jpg");
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

  it("maps Hospeco multi-size fixture to five variants with manufacturer SKUs", () => {
    const html = fs.readFileSync(
      path.join(__dirname, "fixtures", "hospeco-proworks-multi-size.html"),
      "utf8"
    );
    const url =
      "https://www.hospecobrands.com/products/proworks-blue-violet-nitrile-exam-gloves-powder-free-3-mil-hos-gl-n125f-l-gl-n125fl";
    const draft = extractImportDraftFromHtml(html, url);
    expect(draft.variants).toHaveLength(5);
    const codes = draft.variants.map((v) => v.normalized_size_code);
    expect(codes).toEqual(["XS", "S", "M", "L", "XL"]);
    expect(draft.variants.find((v) => v.normalized_size_code === "XS")?.manufacturer_sku).toBe(
      "GL-N125F-XS"
    );
    expect(draft.variants.find((v) => v.normalized_size_code === "XL")?.manufacturer_sku).toBe(
      "GL-N125F-XL"
    );
    expect(draft.variants.every((v) => !v.sku?.startsWith("GLV"))).toBe(true);
    expect(draft.variants.every((v) => v.size_source && v.size_source !== "text_fallback")).toBe(
      true
    );
    expect(draft.proposed_parent_sku).toBe("GLV-GL-N125");
    expect(draft.variants.find((v) => v.normalized_size_code === "M")?.proposed_glovecubs_sku).toBe(
      "GLV-GL-N125M"
    );
    expect(draft.variants.every((v) => v.manufacturer_sku?.startsWith("GL-N125F"))).toBe(true);
  });

  it("maps MainProductId live-style Hospeco fixture to five variants with GLV proposals", () => {
    const html = fs.readFileSync(
      path.join(__dirname, "fixtures", "hospeco-proworks-main-product-id.html"),
      "utf8"
    );
    const url = "https://www.hospecobrands.com/products/proworks-nitrile-gl-n125f";
    const draft = extractImportDraftFromHtml(html, url);
    expect(draft.variants).toHaveLength(5);
    expect(draft.variants.map((v) => v.normalized_size_code)).toEqual(["XS", "S", "M", "L", "XL"]);
    expect(draft.proposed_parent_sku).toBe("GLV-GL-N125");
    expect(draft.variants.map((v) => v.proposed_glovecubs_sku)).toEqual([
      "GLV-GL-N125XS",
      "GLV-GL-N125S",
      "GLV-GL-N125M",
      "GLV-GL-N125L",
      "GLV-GL-N125XL",
    ]);
    expect(draft.variants.map((v) => v.manufacturer_sku)).toEqual([
      "GL-N125F-XS",
      "GL-N125F-S",
      "GL-N125F-M",
      "GL-N125F-L",
      "GL-N125F-XL",
    ]);
    expect(draft.variants.every((v) => v.size_source === "main_product_id")).toBe(true);
  });

  it("buildImportDraftVariants does not generate GLV SKUs from size options", () => {
    const result = extractProductFromHtml(
      fs.readFileSync(path.join(__dirname, "fixtures", "hospeco-proworks-multi-size.html"), "utf8"),
      "https://example.com/p"
    );
    const variants = buildImportDraftVariants(result.extracted, {}, null);
    expect(variants.every((v) => !v.sku?.startsWith("GLV"))).toBe(true);
  });
});
