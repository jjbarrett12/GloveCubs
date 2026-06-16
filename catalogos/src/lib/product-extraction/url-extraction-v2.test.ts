import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { runUrlExtractionV2 } from "./url-extraction-v2";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOSPECO_FIXTURE = path.resolve(
  __dirname,
  "../../../../lib/commerce-packaging/fixtures/hospeco-proworks-nitrile.html"
);

describe("runUrlExtractionV2", () => {
  it("returns valid ProductUrlExtractionV2 from Hospeco nitrile fixture", async () => {
    const html = fs.readFileSync(HOSPECO_FIXTURE, "utf8");
    const extraction = await runUrlExtractionV2({
      url: "https://www.hospecobrands.com/products/proworks-blue-violet-nitrile-exam-gloves",
      html,
      fetchedAt: "2026-06-11T00:00:00.000Z",
    });

    expect(extraction.version).toBe("product-url-extraction-v2");
    expect(extraction.schemaVersion).toBe(1);
    expect(extraction.sourceUrl).toContain("hospecobrands.com");

    const title = extraction.identity.normalizedTitle?.value ?? extraction.identity.sourceTitle?.value ?? "";
    expect(title.toLowerCase()).toMatch(/nitrile|proworks|exam/);

    expect(extraction.taxonomy.material?.value).toBe("nitrile");
    expect(extraction.taxonomy.disposableReusable?.value).toBe("disposable");

    expect(extraction.attributes.thicknessMil?.value).toBe(3);

    const sizes = extraction.variants.proposedVariants.map((v) => v.size).filter(Boolean);
    expect(sizes).toEqual(expect.arrayContaining(["XS", "S", "M", "L", "XL"]));

    expect(extraction.commercePackaging.unitsPerCase?.value).toBe(1000);
    expect(extraction.commercePackaging.innersPerCase?.value).toBe(10);
    expect(extraction.commercePackaging.unitsPerInner?.value).toBe(100);

    expect(extraction.review).not.toHaveProperty("safeToPublishVariants");
    expect(extraction.confidence.overall).toBeGreaterThan(0);
    expect(extraction.confidence.identity).toBeGreaterThan(0.5);
    expect(extraction.confidence.packaging).toBeGreaterThan(0.5);
    expect(extraction.review.safeToStageVariants).toBe(true);
    expect(extraction.review.safeToCreateMaster).toBe(false);
    expect(extraction.review.warnings.some((w) => /image/i.test(w))).toBe(true);
    expect(extraction.review.publishReadinessHints.hasPackagingSignal).toBe(true);
    expect(extraction.review.publishReadinessHints.hasVariantCandidates).toBe(true);
  });

  it("end-to-end JSON-LD page extracts brand and scores without cartesian variants", async () => {
    const html = `<!DOCTYPE html><html><head>
      <script type="application/ld+json">${JSON.stringify({
        "@type": "Product",
        name: "JSON-LD Nitrile Glove",
        brand: { name: "Acme" },
        sku: "AC-NIT-M",
        image: "https://cdn.example.com/jsonld-product.jpg",
      })}</script>
    </head><body>
      <select name="size"><option value="m">M</option><option value="l">L</option></select>
      <button class="swatch" data-value="Blue">Blue</button>
      <img src="https://cdn.example.com/jsonld-product.jpg" alt="JSON-LD Nitrile Glove" class="product-image" width="600" height="600" />
    </body></html>`;
    const extraction = await runUrlExtractionV2({ url: "https://example.com/jsonld-glove", html });
    expect(extraction.identity.brand?.value).toBe("Acme");
    expect(extraction.images.candidates.some((c) => c.absoluteUrl.includes("jsonld-product.jpg"))).toBe(true);
    expect(extraction.variants.proposedVariants.length).toBeLessThan(4);
    expect(extraction.review).not.toHaveProperty("safeToPublishVariants");
  });
});
