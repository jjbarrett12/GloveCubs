import { describe, expect, it } from "vitest";
import { extractImagesFromHtml } from "./extract-images";

describe("extractImagesFromHtml", () => {
  const html = `<!DOCTYPE html><html><body>
    <div class="product-gallery">
      <img class="product-image" src="/images/glove-main.jpg" alt="Blue nitrile exam glove" width="800" height="800" />
      <img class="product-image" src="/images/glove-alt.jpg" alt="Nitrile glove alternate angle" width="600" height="600" />
    </div>
    <img src="/assets/logo.png" alt="Store logo" width="120" height="40" />
    <img src="/assets/payment-visa.png" alt="Visa payment icon" width="32" height="20" />
    <img src="/hero/lifestyle-banner.jpg" alt="lifestyle banner scene" width="1200" height="400" />
    <picture>
      <source srcset="/images/glove-picture-800.jpg 800w, /images/glove-picture-400.jpg 400w" />
      <img src="/images/glove-picture-800.jpg" alt="Nitrile glove picture element" />
    </picture>
    <img src="/swatches/blue-swatch.png" class="swatch color-chip" alt="Blue swatch" width="24" height="24" />
  </body></html>`;

  it("dedupes, resolves absolute URLs, and prefers product over logo/lifestyle", () => {
    const result = extractImagesFromHtml({
      html,
      pageUrl: "https://shop.example.com/products/glove",
      jsonLdImageUrls: ["https://cdn.example.com/jsonld-glove.jpg"],
    });

    const urls = result.candidates.map((c) => c.absoluteUrl);
    expect(urls.every((u) => u.startsWith("https://"))).toBe(true);
    expect(new Set(urls).size).toBe(urls.length);

    const primary = result.candidates.find((c) => c.id === result.primaryCandidateId);
    expect(primary).toBeDefined();
    expect(primary!.role === "primary_product" || primary!.role === "alternate_product").toBe(true);
    expect(primary!.absoluteUrl).not.toMatch(/logo|visa|lifestyle/i);

    expect(result.rejected.some((c) => c.role === "logo" || c.role === "badge")).toBe(true);
    expect(result.candidates.some((c) => c.absoluteUrl.includes("glove-main.jpg"))).toBe(true);
    expect(result.candidates.some((c) => c.absoluteUrl.includes("jsonld-glove.jpg"))).toBe(true);
  });
});
