import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { makeFieldEvidence } from "./evidence-helpers";
import {
  bridgeExtractionV2ToParsedRows,
  buildUrlImportProductPayloadsForExtractionV2,
  INTERNAL_SKU_KEYS,
  summarizeProductUrlExtractionV2,
} from "./extraction-v2-bridge";
import { runUrlExtractionV2 } from "./url-extraction-v2";
import type { ProductUrlExtractionV2 } from "./types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOSPECO_FIXTURE = path.resolve(
  __dirname,
  "../../../../lib/commerce-packaging/fixtures/hospeco-proworks-nitrile.html"
);

function minimalExtraction(overrides: Partial<ProductUrlExtractionV2> = {}): ProductUrlExtractionV2 {
  return {
    version: "product-url-extraction-v2",
    schemaVersion: 1,
    sourceUrl: "https://example.com/glove",
    fetchedAt: "2026-06-11T00:00:00.000Z",
    source: { rawTextSample: "Nitrile exam glove" },
    identity: {
      normalizedTitle: makeFieldEvidence("Nitrile Exam Glove", 0.82, "title"),
      brand: makeFieldEvidence("Proworks", 0.8, "meta"),
    },
    taxonomy: {
      categorySlug: makeFieldEvidence("disposable_gloves", 0.7, "heuristic"),
      material: makeFieldEvidence("nitrile", 0.9, "table"),
      disposableReusable: makeFieldEvidence("disposable", 0.82, "heuristic"),
    },
    commercePackaging: {
      unitsPerCase: makeFieldEvidence(1000, 0.88, "text"),
      innersPerCase: makeFieldEvidence(10, 0.88, "table"),
      unitsPerInner: makeFieldEvidence(100, 0.88, "table"),
    },
    attributes: {
      material: makeFieldEvidence("nitrile", 0.9, "table"),
      examGrade: makeFieldEvidence(true, 0.78, "text"),
    },
    variants: {
      dimensions: [],
      options: [],
      proposedVariants: [],
      unresolvedVariantNotes: [],
    },
    images: {
      candidates: [
        {
          id: "prod1",
          url: "https://example.com/product.jpg",
          absoluteUrl: "https://example.com/product.jpg",
          source: "json_ld",
          role: "primary_product",
          score: 0.9,
          confidence: 0.9,
          trust: "trusted",
          reasons: [],
        },
        {
          id: "logo1",
          url: "https://example.com/logo.png",
          absoluteUrl: "https://example.com/logo.png",
          source: "img",
          role: "logo",
          score: 0.1,
          confidence: 0.1,
          trust: "weak",
          reasons: [],
        },
      ],
      primaryCandidateId: "prod1",
      rejected: [],
    },
    documents: { specSheetUrls: ["https://example.com/spec.pdf"], sdsUrls: [], otherUrls: [] },
    confidence: {
      overall: 0.8,
      identity: 0.8,
      variants: 0.7,
      images: 0.8,
      packaging: 0.85,
      attributes: 0.85,
    },
    review: {
      safeToCreateMaster: true,
      safeToStageVariants: false,
      publishReadinessHints: {
        hasVariantCandidates: false,
        hasImageCandidate: true,
        hasPackagingSignal: true,
        hasSkuSourceSeparation: true,
        warnings: [],
      },
      blockers: [],
      warnings: [],
    },
    ...overrides,
  };
}

describe("summarizeProductUrlExtractionV2", () => {
  it("returns compact summary fields only", () => {
    const extraction = minimalExtraction();
    const summary = summarizeProductUrlExtractionV2(extraction);
    expect(summary.version).toBe("product-url-extraction-v2");
    expect(summary.normalizedTitle).toBe("Nitrile Exam Glove");
    expect(summary.material).toBe("nitrile");
    expect(summary).not.toHaveProperty("identity");
    expect(summary).not.toHaveProperty("images");
    expect(summary).not.toHaveProperty("attributes");
  });
});

describe("bridgeExtractionV2ToParsedRows", () => {
  it("proposed variants produce N rows with shared family fields", () => {
    const extraction = minimalExtraction({
      variants: {
        dimensions: [{ name: "size", confidence: 0.7, trust: "probable", source: "text", options: ["M", "L"] }],
        options: [],
        proposedVariants: [
          {
            size: "M",
            manufacturerSku: "GL-N125F-M",
            supplierSku: "DIST-M-001",
            evidence: [],
            confidence: 0.88,
            trust: "probable",
          },
          {
            size: "L",
            manufacturerSku: "GL-N125F-L",
            evidence: [],
            confidence: 0.88,
            trust: "probable",
          },
        ],
        unresolvedVariantNotes: [],
      },
    });

    const { rows, warnings } = bridgeExtractionV2ToParsedRows({ extraction });
    expect(rows).toHaveLength(2);
    expect(warnings.length).toBe(0);
    expect(rows[0]!.size).toBe("M");
    expect(rows[1]!.size).toBe("L");
    expect(rows[0]!.brand).toBe("Proworks");
    expect(rows[0]!.material).toBe("nitrile");
    expect(rows[0]!.category_slug).toBe("disposable_gloves");
  });

  it("no proposed variants produce one family row and warning", () => {
    const extraction = minimalExtraction({
      variants: {
        dimensions: [],
        options: [],
        proposedVariants: [],
        unresolvedVariantNotes: ["Variant dimensions unresolved."],
      },
    });
    const { rows, warnings } = bridgeExtractionV2ToParsedRows({ extraction });
    expect(rows).toHaveLength(1);
    expect(warnings.some((w) => /no source-confirmed proposed variants/i.test(w))).toBe(true);
  });

  it("manufacturerSku maps to manufacturer fields only, supplierSku to supplier_sku", () => {
    const extraction = minimalExtraction({
      variants: {
        dimensions: [],
        options: [],
        proposedVariants: [
          {
            size: "M",
            manufacturerSku: "GL-N125F-M",
            supplierSku: "SUP-123",
            evidence: [],
            confidence: 0.9,
            trust: "probable",
          },
        ],
        unresolvedVariantNotes: [],
      },
    });
    const { rows } = bridgeExtractionV2ToParsedRows({ extraction });
    const row = rows[0]!;
    expect(row.manufacturer_sku).toBe("GL-N125F-M");
    expect(row.manufacturer_part_number).toBe("GL-N125F-M");
    expect(row.supplier_sku).toBe("SUP-123");
    for (const key of INTERNAL_SKU_KEYS) {
      expect(row[key]).toBeUndefined();
    }
    expect(row.id).toBeUndefined();
  });

  it("does not map GLV-looking SKU to internal sku fields", () => {
    const extraction = minimalExtraction({
      variants: {
        dimensions: [],
        options: [],
        proposedVariants: [
          {
            size: "M",
            manufacturerSku: "GLV-GL-N125M",
            evidence: [],
            confidence: 0.9,
            trust: "probable",
          },
        ],
        unresolvedVariantNotes: [],
      },
    });
    const { rows } = bridgeExtractionV2ToParsedRows({ extraction });
    const row = rows[0]!;
    expect(row.manufacturer_sku).toBeUndefined();
    expect(row.sku).toBeUndefined();
    expect(row.supplier_sku).toBeUndefined();
  });

  it("uses usable product images and not logo when product image exists", () => {
    const { rows } = bridgeExtractionV2ToParsedRows({ extraction: minimalExtraction() });
    const images = rows[0]!.images as string[];
    expect(images).toContain("https://example.com/product.jpg");
    expect(images).not.toContain("https://example.com/logo.png");
    expect(rows[0]!.image_url).toBe("https://example.com/product.jpg");
  });

  it("attaches commerce_packaging when V2 packaging exists", () => {
    const { rows } = bridgeExtractionV2ToParsedRows({ extraction: minimalExtraction() });
    const cp = rows[0]!.commerce_packaging as Record<string, unknown>;
    expect(cp).toBeDefined();
    expect(cp.units_per_case).toBe(1000);
  });

  it("attaches compact _extraction_v2 summary to every row without full blob", () => {
    const extraction = minimalExtraction({
      variants: {
        dimensions: [],
        options: [],
        proposedVariants: [
          { size: "M", evidence: [], confidence: 0.7, trust: "probable" },
          { size: "L", evidence: [], confidence: 0.7, trust: "probable" },
        ],
        unresolvedVariantNotes: [],
      },
    });
    const { rows } = bridgeExtractionV2ToParsedRows({ extraction });
    for (const row of rows) {
      const summary = row._extraction_v2 as Record<string, unknown>;
      expect(summary.version).toBe("product-url-extraction-v2");
      expect(summary).not.toHaveProperty("variants");
      expect(summary).not.toHaveProperty("source");
    }
  });

  it("full V2 blob never appears inside normalized bridged row", () => {
    const extraction = minimalExtraction({
      variants: {
        dimensions: [],
        options: [],
        proposedVariants: [{ size: "M", evidence: [], confidence: 0.7, trust: "probable" }],
        unresolvedVariantNotes: [],
      },
    });
    const { rows, summary } = bridgeExtractionV2ToParsedRows({ extraction });
    const summaryOnRow = rows[0]!._extraction_v2 as Record<string, unknown>;
    expect(summaryOnRow.version).toBe("product-url-extraction-v2");
    expect(summaryOnRow).not.toHaveProperty("identity");
    expect(summaryOnRow).not.toHaveProperty("images");
    expect(JSON.stringify(summaryOnRow).length).toBeLessThan(JSON.stringify(extraction).length / 2);
    expect(summary.proposedVariantCount).toBe(1);
  });

  it("bridges Hospeco extraction to multiple size rows", async () => {
    const html = fs.readFileSync(HOSPECO_FIXTURE, "utf8");
    const extraction = await runUrlExtractionV2({
      url: "https://www.hospecobrands.com/products/proworks-blue-violet-nitrile-exam-gloves",
      html,
    });
    const { rows } = bridgeExtractionV2ToParsedRows({ extraction });
    expect(rows.length).toBeGreaterThanOrEqual(5);
    expect(rows.every((r) => r.material === "nitrile")).toBe(true);
    expect(rows.every((r) => (r.commerce_packaging as { units_per_case?: number })?.units_per_case === 1000)).toBe(
      true
    );
    for (const key of INTERNAL_SKU_KEYS) {
      expect(rows.every((r) => r[key] === undefined)).toBe(true);
    }
  });
});

describe("buildUrlImportProductPayloadsForExtractionV2", () => {
  it("stores full extraction only on first rawPayload", () => {
    const extraction = minimalExtraction({
      variants: {
        dimensions: [],
        options: [],
        proposedVariants: [
          { size: "M", evidence: [], confidence: 0.7, trust: "probable" },
          { size: "L", evidence: [], confidence: 0.7, trust: "probable" },
        ],
        unresolvedVariantNotes: [],
      },
    });
    const { rows } = bridgeExtractionV2ToParsedRows({ extraction });
    const payloads = buildUrlImportProductPayloadsForExtractionV2({
      extraction,
      rows,
      legacyRawPayload: { legacy: true },
    });
    expect(payloads).toHaveLength(2);
    expect(payloads[0]!.rawPayload.extraction_v2).toEqual(extraction);
    expect(payloads[0]!.rawPayload.product_setup_contract).toBeDefined();
    expect(payloads[0]!.rawPayload.product_setup_contract_full).toBeDefined();
    expect(payloads[1]!.rawPayload.extraction_v2).toBeUndefined();
    expect(payloads[0]!.normalizedPayload._extraction_v2).toBeDefined();
    expect(payloads[0]!.normalizedPayload.product_setup_contract_summary).toBeDefined();
    expect((payloads[0]!.normalizedPayload as Record<string, unknown>).extraction_v2).toBeUndefined();
  });
});
