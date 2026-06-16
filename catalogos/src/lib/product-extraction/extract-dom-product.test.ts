import { describe, expect, it } from "vitest";
import { extractDomProductFromHtml } from "./extract-dom-product";

describe("extractDomProductFromHtml", () => {
  const html = `<!DOCTYPE html><html><body>
    <h1 class="product-title">Nitrile Exam Glove</h1>
    <div class="product-description">Powder-free nitrile exam glove for medical use.</div>
    <ul class="product-details">
      <li>Powder free</li>
      <li>3 mil thickness</li>
    </ul>
    <table>
      <tr><th>Material</th><td>Nitrile</td></tr>
      <tr><th>Thickness</th><td>3 Mil</td></tr>
    </table>
    <a href="/docs/spec-sheet.pdf">Product Spec Sheet</a>
    <a href="/docs/safety-data-sheet.pdf">SDS Safety Data Sheet</a>
  </body></html>`;

  it("extracts title candidates, bullets, spec table, and documents", () => {
    const result = extractDomProductFromHtml(html, "https://shop.example.com/p/glove");
    expect(result.titleCandidates.some((t) => /Nitrile Exam Glove/i.test(t.value))).toBe(true);
    expect(result.bullets?.value).toEqual(expect.arrayContaining(["Powder free", "3 mil thickness"]));
    expect(result.specTable.material?.toLowerCase()).toBe("nitrile");
    expect(result.description?.value).toMatch(/Powder-free nitrile/i);
    expect(result.documents.specSheetUrls.some((u) => u.includes("spec-sheet.pdf"))).toBe(true);
    expect(
      [...result.documents.sdsUrls, ...result.documents.specSheetUrls].some((u) =>
        u.includes("safety-data-sheet.pdf")
      )
    ).toBe(true);
    expect(result.rawTextSample.length).toBeGreaterThan(20);
  });
});
