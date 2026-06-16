import { describe, expect, it } from "vitest";
import { extractJsonLdFromHtml } from "./extract-json-ld";

describe("extractJsonLdFromHtml", () => {
  it("extracts Product fields with evidence", () => {
    const html = `<html><head>
      <script type="application/ld+json">${JSON.stringify({
        "@type": "Product",
        name: "Blue Nitrile Exam Glove",
        brand: { name: "Proworks" },
        sku: "GL-N125F-M",
        mpn: "MPN-125",
        model: "GL-N125",
        description: "Powder free nitrile exam glove",
        image: "https://cdn.example.com/glove-main.jpg",
      })}</script>
    </head></html>`;

    const result = extractJsonLdFromHtml(html);
    expect(result.title?.value).toBe("Blue Nitrile Exam Glove");
    expect(result.brand?.value).toBe("Proworks");
    expect(result.sku?.value).toBe("GL-N125F-M");
    expect(result.mpn?.value).toBe("MPN-125");
    expect(result.model?.value).toBe("GL-N125");
    expect(result.imageUrls).toContain("https://cdn.example.com/glove-main.jpg");
    expect(result.productItems.length).toBeGreaterThan(0);
  });

  it("flattens Product inside @graph", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@graph": [
        { "@type": "WebPage", name: "Page" },
        {
          "@type": "Product",
          name: "Graph Product Glove",
          brand: "Acme",
          sku: "AC-1",
        },
      ],
    })}</script>`;

    const result = extractJsonLdFromHtml(html);
    expect(result.title?.value).toBe("Graph Product Glove");
    expect(result.sku?.value).toBe("AC-1");
  });

  it("collects ProductGroup hints and Offer nodes", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "ProductGroup",
      name: "Glove Family",
      hasVariant: [{ "@type": "Product", sku: "V1", name: "Size M" }],
    })}</script>
    <script type="application/ld+json">${JSON.stringify({
      "@type": "AggregateOffer",
      lowPrice: "10",
      highPrice: "20",
    })}</script>`;

    const result = extractJsonLdFromHtml(html);
    expect(result.productGroupHints.length).toBeGreaterThan(0);
    expect(result.offers.length).toBeGreaterThan(0);
  });

  it("does not throw on invalid JSON-LD", () => {
    const html = `<script type="application/ld+json">{ invalid json</script>
      <script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: "OK Product" })}</script>`;
    expect(() => extractJsonLdFromHtml(html)).not.toThrow();
    const result = extractJsonLdFromHtml(html);
    expect(result.title?.value).toBe("OK Product");
  });
});
