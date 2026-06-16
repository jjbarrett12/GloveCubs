import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runNormalization } from "@/lib/normalization/normalization-engine";
import { bridgeExtractionV2ToParsedRows } from "./extraction-v2-bridge";
import { extractVariantsFromHtml } from "./extract-variants";
import {
  buildProductSetupContractFromExtractionV2,
  buildProductSetupContractSummary,
} from "./product-setup-contract";
import { buildProductSetupWizardReadiness } from "./product-setup-wizard-readiness";
import { runUrlExtractionV2 } from "./url-extraction-v2";

const FIXTURE = path.resolve(__dirname, "fixtures/n105orf-orange-nitrile-xl.html");
const PAGE_URL = "https://shop.example.com/safety-zone-orange-nitrile-exam-gloves-xl-N105ORFXL";

describe("N105ORF family extraction fixture", () => {
  const html = fs.readFileSync(FIXTURE, "utf8");

  it("promotes five distinct manufacturer variants with strong family evidence", () => {
    const result = extractVariantsFromHtml({
      html,
      pageUrl: PAGE_URL,
      specTable: { number: "N105ORFXL", size: "XL", sku: "N105ORFXL" },
    });

    expect(result.proposedVariants).toHaveLength(5);
    expect(result.familyBaseSku).toBe("N105ORF");
    expect(result.familyEvidenceTier).toBe("strong");
    expect(result.selectedSize).toBe("XL");

    const skus = result.proposedVariants.map((v) => v.manufacturerSku).sort();
    expect(skus).toEqual(["N105ORFL", "N105ORFM", "N105ORFS", "N105ORFX", "N105ORFXL"]);

    const sizes = result.proposedVariants.map((v) => v.size).sort();
    expect(sizes).toEqual(["L", "M", "S", "X", "XL"]);

    expect(result.proposedVariants.some((v) => v.size === "X" && v.manufacturerSku === "N105ORFX")).toBe(true);
    expect(result.proposedVariants.some((v) => v.size === "XL" && v.manufacturerSku === "N105ORFXL")).toBe(true);

    expect(result.proposedVariants.every((v) => !/^(GLV|GC)[-_]/i.test(v.manufacturerSku ?? ""))).toBe(true);
  });

  it("integrates through runUrlExtractionV2 with family metadata", async () => {
    const extraction = await runUrlExtractionV2({ url: PAGE_URL, html });
    expect(extraction.variants.proposedVariants.length).toBeGreaterThanOrEqual(5);
    expect(extraction.variants.familyBaseSku).toBe("N105ORF");
    expect(extraction.variants.familyEvidenceTier).toBe("strong");
  });

  it("sanitizes selected XL from parent copy while preserving variant size labels", async () => {
    const extraction = await runUrlExtractionV2({ url: PAGE_URL, html });

    expect(extraction.variants.selectedSize).toBe("XL");
    expect(extraction.identity.normalizedTitle?.value).toBeDefined();
    expect(extraction.identity.normalizedTitle?.value).not.toMatch(/\bXL\b/i);
    expect(extraction.identity.sourceTitle?.value).toMatch(/XL/i);

    const contract = buildProductSetupContractSummary(
      buildProductSetupContractFromExtractionV2(extraction)
    );
    expect(contract.identity.title).toBeDefined();
    expect(contract.identity.title).not.toMatch(/\bXL\b/i);
    expect(contract.variants.selectedSize).toBe("XL");
    expect(contract.variants.proposedVariants.length).toBeGreaterThanOrEqual(5);
    expect(contract.variants.proposedVariants.map((v) => v.size).sort()).toEqual([
      "L",
      "M",
      "S",
      "X",
      "XL",
    ]);

    const { rows } = bridgeExtractionV2ToParsedRows({ extraction });
    expect(rows).toHaveLength(5);
    const xlRow = rows.find((row) => row.manufacturer_sku === "N105ORFXL");
    expect(xlRow?.name ?? xlRow?.title).toMatch(/\bXL\b/i);
    for (const row of rows) {
      const name = String(row.name ?? row.title ?? "");
      if (row.size === "XL") {
        expect(name).toMatch(/\bXL\b/i);
      } else {
        expect(name).not.toMatch(/\bXL\b/i);
      }
    }
  });

  it("normalizes attribute and packaging fields for wizard setup", async () => {
    const extraction = await runUrlExtractionV2({ url: PAGE_URL, html });
    const { rows } = bridgeExtractionV2ToParsedRows({ extraction });
    const result = runNormalization(rows[0] as Record<string, unknown>);

    expect(result.filter_attributes.material).toBe("nitrile");
    expect(result.filter_attributes.color).toBe("orange");
    expect(result.filter_attributes.thickness_mil).toBe("5");
    expect(result.filter_attributes.powder).toBe("powder_free");
    expect(result.filter_attributes.certifications).toContain("latex_free");
    expect(result.filter_attributes.grade).toBe("medical_exam_grade");
    expect(result.filter_attributes.packaging).toBe("case_1000_ct");

    const contract = buildProductSetupContractSummary(
      buildProductSetupContractFromExtractionV2(extraction)
    );
    const readiness = buildProductSetupWizardReadiness({
      contractSummary: contract,
      normalizedData: { filter_attributes: result.filter_attributes },
    });

    const attr = readiness.sections.attributes.fields;
    expect(attr.find((f) => f.key === "powderFree")?.normalizedValue).toBe("powder_free");
    expect(attr.find((f) => f.key === "latexFree")?.normalizedValue).toBe("latex_free");
    expect(attr.find((f) => f.key === "grade")?.normalizedValue).toBe("medical_exam_grade");
    expect(readiness.sections.commercePackaging.fields.find((f) => f.key === "packaging")?.normalizedValue).toBe(
      "case_1000_ct"
    );
    expect(attr.find((f) => f.key === "medicalGrade")?.blockReason).toMatch(/High-risk/i);
  });
});

describe("weak single-SKU extraction", () => {
  it("does not invent a full family from one SKU", () => {
    const result = extractVariantsFromHtml({
      html: `<html><body><h1>Glove XL</h1><table><tr><td>SKU</td><td>ABC123XL</td></tr><tr><td>Size</td><td>XL</td></tr></table></body></html>`,
      pageUrl: "https://shop.example.com/p/abc123xl",
      specTable: { sku: "ABC123XL", size: "XL" },
    });

    expect(result.proposedVariants.length).toBeLessThanOrEqual(1);
    expect(result.familyEvidenceTier).toBe("weak");
    expect(result.unresolvedVariantNotes.some((n) => /single|selected-size|stronger sibling/i.test(n))).toBe(true);
  });

  it("sanitizes parent title when selectedSize is known without inventing variants", async () => {
    const weakHtml = `<html><head><title>ABC Glove XL</title></head><body><h1>ABC Glove XL</h1><table><tr><td>SKU</td><td>ABC123XL</td></tr><tr><td>Size</td><td>XL</td></tr></table></body></html>`;
    const extraction = await runUrlExtractionV2({
      url: "https://shop.example.com/p/abc123xl",
      html: weakHtml,
    });

    expect(extraction.variants.proposedVariants.length).toBeLessThanOrEqual(1);
    expect(extraction.variants.familyEvidenceTier).toBe("weak");
    expect(extraction.variants.selectedSize).toBe("XL");
    expect(extraction.identity.normalizedTitle?.value).not.toMatch(/\bXL\b/i);
  });
});

describe("internal SKU rejection", () => {
  it("ignores GLV- and GC- tokens in page markup", () => {
    const result = extractVariantsFromHtml({
      html: `<html><body>
        <input name="MainProductId" value="GLV-N105ORFXL,GC-N105ORFXL,N105ORFXL" />
      </body></html>`,
      pageUrl: "https://shop.example.com/p/glove",
      specTable: { number: "N105ORFXL", size: "XL" },
    });

    expect(result.manufacturerSkuCandidates.every((s) => !/^(GLV|GC)[-_]/i.test(s))).toBe(true);
    expect(result.proposedVariants.every((v) => !/^(GLV|GC)[-_]/i.test(v.manufacturerSku ?? ""))).toBe(true);
  });
});
