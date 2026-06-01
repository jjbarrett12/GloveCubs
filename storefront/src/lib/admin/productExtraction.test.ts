import { describe, expect, it } from "vitest";
import {
  extractColorPhrase,
  extractProductFromHtml,
  inferBrandFromTitle,
} from "@/lib/admin/productExtraction";

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
