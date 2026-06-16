import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { bridgeExtractionV2ToParsedRows } from "./extraction-v2-bridge";
import { extractCommercePackagingFields } from "./extract-commerce-packaging";
import { extractGloveAttributes } from "./extract-glove-attributes";
import { runUrlExtractionV2 } from "./url-extraction-v2";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, "fixtures/hospeco-polyethylene-gloves-small.html");
const URL =
  "https://www.hospecobrands.com/products/hbg-products/gloves/polyethylene-gloves-20-boxes-of-500-gloves-small";

describe("Hospeco polyethylene glove regression (Phase 3E.C.1)", () => {
  const html = fs.readFileSync(FIXTURE, "utf8");

  it("extracts material, compliance, and thickness without latex/vinyl/5-mil false positives", () => {
    const glove = extractGloveAttributes({
      title: "Safety Zone® Polyethylene Gloves, Powder-Free, Embossed Grip, 20x500, Clear, 0.5 mil - Small",
      bullets: [
        "100% synthetic HDPE resin",
        "Latex free, powder free, DEHP free",
        "Cost effective alternative to vinyl gloves",
        "Meets FDA CFR Title 21 Indirect Food Additive Regulations Part 174-178",
      ],
      specTable: {
        material: "Polyethylene",
        color: "Clear",
        size: "Small",
        "packaging put/up": "500/bx - 20 bxs/cs",
      },
    });

    expect(glove.attributes.material?.value).toBe("polyethylene");
    expect(glove.attributes.latexFree?.value).toBe(true);
    expect(glove.attributes.powderFree?.value).toBe(true);
    expect(glove.attributes.foodSafe?.value).toBe(true);
    expect(glove.attributes.color?.value).toBe("clear");
    expect(glove.attributes.thicknessMil?.value).toBe(0.5);
    expect(glove.attributes.material?.value).not.toBe("latex");
    expect(glove.attributes.material?.value).not.toBe("vinyl");
    expect(glove.attributes.thicknessMil?.value).not.toBe(5);
  });

  it("parses case packaging from Product Details and ignores pallet tier qty", () => {
    const packaging = extractCommercePackagingFields({
      html,
      pageUrl: URL,
      categorySlug: "disposable_gloves",
      specTable: {
        "packaging put/up": "500/bx - 20 bxs/cs",
        "pallet ti x hi = qty": "200 x 5 = 1000",
      },
    });

    expect(packaging.unitsPerInner?.value).toBe(500);
    expect(packaging.innersPerCase?.value).toBe(20);
    expect(packaging.unitsPerCase?.value).toBe(10000);
    expect(packaging.caseLabel?.value).toBe("20 boxes × 500 gloves = 10,000 gloves");
    expect(packaging.unitsPerCase?.value).not.toBe(1000);
    expect(packaging.packTextRaw?.value ?? "").toMatch(/500\/bx\s*-\s*20 bxs\/cs/i);
  });

  it("runs full V2 extraction on saved HTML fixture", async () => {
    const extraction = await runUrlExtractionV2({ url: URL, html });

    expect(extraction.identity.normalizedTitle?.value ?? extraction.identity.sourceTitle?.value).toMatch(
      /Polyethylene Gloves/i
    );
    expect(extraction.identity.manufacturerSkuCandidates?.value).toContain("GL-P500S");
    expect(extraction.identity.brand?.value).toMatch(/Safety Zone/i);
    expect(extraction.attributes.material?.value).toBe("polyethylene");
    expect(extraction.attributes.latexFree?.value).toBe(true);
    expect(extraction.attributes.powderFree?.value).toBe(true);
    expect(extraction.attributes.color?.value).toBe("clear");
    expect(extraction.attributes.thicknessMil?.value).toBe(0.5);
    expect(extraction.commercePackaging.unitsPerCase?.value).toBe(10000);
    expect(extraction.commercePackaging.innersPerCase?.value).toBe(20);
    expect(extraction.commercePackaging.unitsPerInner?.value).toBe(500);
    expect(extraction.commercePackaging.caseLabel?.value).toBe("20 boxes × 500 gloves = 10,000 gloves");
    expect(extraction.commercePackaging.unitsPerCase?.value).not.toBe(1000);

    const proposedSkus = extraction.variants.proposedVariants.map((v) => v.manufacturerSku).sort();
    expect(proposedSkus.every((sku) => /^GL-P500/i.test(sku ?? ""))).toBe(true);
    expect(proposedSkus).not.toContain("GL-P500L");
    expect(extraction.variants.proposedVariants.length).toBeLessThanOrEqual(2);
    if (extraction.variants.unresolvedVariantNotes.length > 0) {
      expect(extraction.variants.unresolvedVariantNotes.some((n) =>
        /sibling|rendered|linked|selected-size|stronger|family|review|confirm/i.test(n)
      )).toBe(true);
    }
  }, 120_000);

  it("bridges to staging row with polyethylene, 0.5 mil, and 10000 case units", async () => {
    const extraction = await runUrlExtractionV2({ url: URL, html });
    const { rows } = bridgeExtractionV2ToParsedRows({ extraction });
    const row = rows[0]!;

    expect(row.material).toBe("polyethylene");
    expect(row.latex_free).toBe(true);
    expect(row.powder_free).toBe(true);
    expect(row.thickness_mil).toBe(0.5);
    expect(row.thickness).toBe(0.5);
    expect(row.thickness_mil).not.toBe(5);
    expect(row.manufacturer_sku).toBe("GL-P500S");
    expect(row.sku).toBeUndefined();
    expect((row.commerce_packaging as { units_per_case?: number }).units_per_case).toBe(10000);
  }, 120_000);
});
