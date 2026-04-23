import { describe, it, expect } from "vitest";
import { validateInvoiceRecommendationIntegrity } from "./invoiceRecommendIntegrity";
import type { SellableCatalogItem } from "./sellableCatalogForInvoice";
import type { InvoiceRecommendResponse } from "@/lib/ai/schemas";

const catalog: SellableCatalogItem[] = [
  { sku: "SKU1", displayName: "Glove A", listPriceCents: 300 },
  { sku: "SKU2", displayName: "Glove B", listPriceCents: 500 },
];

describe("validateInvoiceRecommendationIntegrity", () => {
  it("rejects unknown recommended_sku", () => {
    const lines = [{ description: "x", quantity: 1, unit_price: 10, total: 10 }];
    const data: InvoiceRecommendResponse = {
      total_current_estimate: 10,
      total_recommended_estimate: 3,
      estimated_savings: 7,
      swaps: [
        {
          line_index: 0,
          current_description: "x",
          recommended_sku: "NOT_IN_CATALOG",
          recommended_name: "Fake",
          brand: null,
          estimated_savings: null,
          reason: "test",
          confidence: 0.5,
        },
      ],
    };
    const r = validateInvoiceRecommendationIntegrity(lines, catalog, data);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("RECOMMENDATION_VALIDATION_FAILED");
      expect(r.error).toMatch(/Unknown recommended_sku/);
    }
  });

  it("accepts valid swaps and reconciled totals", () => {
    const lines = [{ description: "a", quantity: 2, unit_price: 5, total: null }];
    const data: InvoiceRecommendResponse = {
      total_current_estimate: 10,
      total_recommended_estimate: 6,
      estimated_savings: 4,
      swaps: [
        {
          line_index: 0,
          current_description: "a",
          recommended_sku: "SKU1",
          recommended_name: "Glove A",
          brand: null,
          estimated_savings: null,
          reason: "cheaper",
          confidence: 0.9,
        },
      ],
    };
    expect(validateInvoiceRecommendationIntegrity(lines, catalog, data)).toEqual({ ok: true });
  });

  it("rejects when totals do not reconcile", () => {
    const lines = [{ description: "a", quantity: 2, unit_price: 5, total: null }];
    const data: InvoiceRecommendResponse = {
      total_current_estimate: 10,
      total_recommended_estimate: 999,
      estimated_savings: 4,
      swaps: [
        {
          line_index: 0,
          current_description: "a",
          recommended_sku: "SKU1",
          recommended_name: "Glove A",
          brand: null,
          estimated_savings: null,
          reason: "cheaper",
          confidence: 0.9,
        },
      ],
    };
    const r = validateInvoiceRecommendationIntegrity(lines, catalog, data);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("RECOMMENDATION_VALIDATION_FAILED");
  });

  it("requires zero totals when there are no swaps", () => {
    const lines = [{ description: "a", quantity: 1, unit_price: 1, total: 1 }];
    const bad: InvoiceRecommendResponse = {
      total_current_estimate: 5,
      total_recommended_estimate: 0,
      estimated_savings: 0,
      swaps: [],
    };
    expect(validateInvoiceRecommendationIntegrity(lines, catalog, bad).ok).toBe(false);

    const good: InvoiceRecommendResponse = {
      total_current_estimate: 0,
      total_recommended_estimate: 0,
      estimated_savings: 0,
      swaps: [],
    };
    expect(validateInvoiceRecommendationIntegrity(lines, catalog, good)).toEqual({ ok: true });
  });
});
