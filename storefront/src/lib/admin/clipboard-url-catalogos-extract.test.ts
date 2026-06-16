import { describe, expect, it } from "vitest";
import {
  CLIPBOARD_EXTRACTION_AUTHORITY_CATALOGOS,
  importDraftFromCatalogosUrlProduct,
} from "@/lib/admin/clipboard-url-catalogos-extract";
import type { UrlImportExtractedProduct } from "@/lib/admin/url-import-adapter";

describe("clipboard-url-catalogos-extract", () => {
  it("maps CatalogOS product row to ImportDraftProductV1 with manufacturer SKU", () => {
    const product: UrlImportExtractedProduct = {
      id: "prod-1",
      title: "Nitrile Exam Glove",
      brand: "Proworks",
      sku: "GL-N125F-M",
      mpn: "GL-N125F-M",
      gtin: null,
      sourceUrl: "https://example.com/glove",
      images: ["https://example.com/img.jpg"],
      attributes: [{ key: "Material", value: "nitrile" }],
      warnings: [],
      duplicateCandidates: [],
      familyGroupKey: null,
      baseSku: null,
      size: "M",
      confidence: 0.82,
      aiUsed: false,
      extractionMethod: "deterministic",
    };
    const draft = importDraftFromCatalogosUrlProduct(
      product,
      {
        id: "prod-1",
        source_url: "https://example.com/glove",
        normalized_payload: {
          name: "Nitrile Exam Glove",
          manufacturer_sku: "GL-N125F-M",
          supplier_sku: "GL-N125F-M",
        },
      },
      "https://example.com/glove",
      null
    );
    expect(draft.product_name).toBe("Nitrile Exam Glove");
    expect(draft.sku).toBe("GL-N125F-M");
    expect(draft.variants[0]?.normalized_size_code).toBe("M");
    expect(draft.variants[0]?.manufacturer_sku).toBe("GL-N125F-M");
    expect(draft.parse_warnings).toContain(
      `extraction_authority:${CLIPBOARD_EXTRACTION_AUTHORITY_CATALOGOS}`
    );
  });
});
