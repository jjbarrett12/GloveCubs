import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  extractColorPhrase,
  extractProductFromHtml,
  extractSizeOptionsFromHtml,
  inferBrandFromTitle,
} from "@/lib/admin/productExtraction";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("inferBrandFromTitle", () => {
  it("extracts Safety Zone from title with registered mark", () => {
    expect(
      inferBrandFromTitle(
        "Safety Zone® Nitrile Exam Gloves Powder Free 3 mil Medium Blue Violet"
      )
    ).toBe("Safety Zone");
  });

  it("does not invent brand from generic glove titles", () => {
    expect(inferBrandFromTitle("Nitrile Exam Gloves Medium Blue 3 mil")).toBeNull();
    expect(inferBrandFromTitle("Powder Free Disposable Gloves")).toBeNull();
  });
});

describe("extractColorPhrase", () => {
  it("parses Blue Violet from title text", () => {
    expect(
      extractColorPhrase("ProWorks Blue Violet Nitrile Exam Gloves Powder Free")
    ).toBe("Blue Violet");
  });

  it("does not false-positive unrelated words", () => {
    expect(extractColorPhrase("Nitrile Exam Gloves Medium 3 mil")).toBeNull();
  });
});

describe("extractProductFromHtml brand/color fallbacks", () => {
  it("infers brand and color from title when structured data missing", () => {
    const html = `
      <html>
      <head><title>Safety Zone® Blue Violet Nitrile Exam Gloves 3 mil M</title></head>
      <body><h1>Safety Zone® Blue Violet Nitrile Exam Gloves</h1></body>
      </html>`;
    const result = extractProductFromHtml(html);
    expect(result.extracted.brand).toBe("Safety Zone");
    expect(result.extracted.color).toBe("Blue Violet");
  });
});

describe("extractProductFromHtml Hospeco-like signals", () => {
  it("extracts gallery images, pack quantities, and certification slugs", () => {
    const html = `
      <html>
      <head>
        <title>Safety Zone® Nitrile Exam Gloves, Powder-Free, 10x200, Blue Violet, 3 mil – Large</title>
        <meta property="og:image" content="https://cdn.example.com/glove-main.jpg" />
      </head>
      <body>
        <h1>Safety Zone® Nitrile Exam Gloves</h1>
        <ul>
          <li>Material: Nitrile</li>
          <li>Thickness: 3 mil</li>
          <li>Standard: Meets ASTM D6319, Complies with FDA CFR Title 21 Indirect Food Additive Regulations Part 177</li>
        </ul>
        <div class="product-gallery">
          <img src="https://cdn.example.com/glove-main.jpg" />
          <img src="https://cdn.example.com/glove-box.jpg" />
          <img src="https://cdn.example.com/glove-wear.jpg" />
          <img src="https://cdn.example.com/glove-detail.jpg" />
        </div>
      </body>
      </html>`;
    const result = extractProductFromHtml(
      html,
      "https://www.hospecobrands.com/products/proworks-blue-violet-nitrile-exam-gloves"
    );
    expect(result.extracted.images).toHaveLength(4);
    expect(result.extracted.pack_size).toBe(200);
    expect(result.extracted.boxes_per_case).toBe(10);
    expect(result.extracted.total_units_per_case).toBe(2000);
    expect(result.extracted.certifications).toEqual(
      expect.arrayContaining(["astm_d6319", "fda_food_contact"])
    );
    expect(result.extracted.food_safe).toBe(true);
  });
});

describe("extractSizeOptionsFromHtml Hospeco multi-size fixture", () => {
  const html = fs.readFileSync(
    path.join(__dirname, "fixtures", "hospeco-proworks-multi-size.html"),
    "utf8"
  );
  const url =
    "https://www.hospecobrands.com/products/proworks-blue-violet-nitrile-exam-gloves-powder-free-3-mil-hos-gl-n125f-l-gl-n125fl";

  it("detects five normalized sizes with manufacturer SKUs", () => {
    const { sizes, warnings } = extractSizeOptionsFromHtml(html, html, url);
    expect(sizes).toHaveLength(5);
    const codes = sizes.map((s) => s.normalizedCode);
    expect(codes).toEqual(["XS", "S", "M", "L", "XL"]);
    expect(new Set(codes).size).toBe(5);
    expect(sizes.find((s) => s.normalizedCode === "XS")?.manufacturerSku).toBe("GL-N125F-XS");
    expect(sizes.find((s) => s.normalizedCode === "S")?.manufacturerSku).toBe("GL-N125F-S");
    expect(sizes.find((s) => s.normalizedCode === "M")?.manufacturerSku).toBe("GL-N125F-M");
    expect(sizes.find((s) => s.normalizedCode === "L")?.manufacturerSku).toBe("GL-N125F-L");
    expect(sizes.find((s) => s.normalizedCode === "XL")?.manufacturerSku).toBe("GL-N125F-XL");
    expect(sizes.every((s) => s.source !== "text_fallback")).toBe(true);
    expect(warnings.some((w) => /text fallback/i.test(w))).toBe(false);
  });

  it("integrates size_options into extractProductFromHtml", () => {
    const result = extractProductFromHtml(html, url);
    expect(result.extracted.size_options).toHaveLength(5);
    expect(result.extracted.sizes_available).toHaveLength(5);
  });
});

describe("extractSizeOptionsFromHtml Hospeco MainProductId live-style fixture", () => {
  const html = fs.readFileSync(
    path.join(__dirname, "fixtures", "hospeco-proworks-main-product-id.html"),
    "utf8"
  );
  const url =
    "https://www.hospecobrands.com/products/proworks-blue-violet-nitrile-exam-gloves-powder-free-3-mil-hos-gl-n125f-l-gl-n125fl";

  it("parses MainProductId CSV plus current page L into five sizes", () => {
    const { sizes, warnings } = extractSizeOptionsFromHtml(html, html, url);
    expect(sizes).toHaveLength(5);
    expect(sizes.map((s) => s.normalizedCode)).toEqual(["XS", "S", "M", "L", "XL"]);
    expect(sizes.find((s) => s.normalizedCode === "L")?.manufacturerSku).toBe("GL-N125F-L");
    expect(sizes.find((s) => s.normalizedCode === "XS")?.manufacturerSku).toBe("GL-N125F-XS");
    expect(sizes.every((s) => s.source === "main_product_id")).toBe(true);
    expect(sizes.every((s) => (s.confidence ?? 0) >= 0.88)).toBe(true);
    expect(warnings.some((w) => /compact MainProductId/i.test(w))).toBe(true);
  });

  it("does not duplicate sizes when MainProductId overlaps page SKU", () => {
    const { sizes } = extractSizeOptionsFromHtml(html, html, url);
    expect(new Set(sizes.map((s) => s.normalizedCode)).size).toBe(5);
  });
});

const LIVE_HOSPECO_HTML = path.join(__dirname, "..", "..", "..", "tmp-hospeco-live.html");

describe.skipIf(!fs.existsSync(LIVE_HOSPECO_HTML))(
  "extractSizeOptionsFromHtml live Hospeco HTML fetch",
  () => {
    const html = fs.readFileSync(LIVE_HOSPECO_HTML, "utf8");
    const url =
      "https://www.hospecobrands.com/products/proworks-blue-violet-nitrile-exam-gloves-powder-free-3-mil-hos-gl-n125f-l-gl-n125fl";

    it("extracts five sizes from fetched live static HTML", () => {
      const { sizes } = extractSizeOptionsFromHtml(html, html, url);
      expect(sizes.map((s) => s.normalizedCode)).toEqual(["XS", "S", "M", "L", "XL"]);
      expect(sizes.find((s) => s.normalizedCode === "XL")?.manufacturerSku).toBe("GL-N125F-XL");
    });
  }
);
