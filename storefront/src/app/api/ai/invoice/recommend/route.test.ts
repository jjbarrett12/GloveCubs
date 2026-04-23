/**
 * Invoice recommend route — catalog fail-closed and no AI call when catalog missing.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const hoisted = vi.hoisted(() => ({
  fetchSellableCatalogForInvoice: vi.fn(),
  aiInvoiceSavings: vi.fn(),
}));

vi.mock("@/lib/ai/middleware", () => ({
  checkAiRateLimit: () => ({ allowed: true }),
}));

vi.mock("@/lib/supabase/server", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: vi.fn(() => ({})),
}));

vi.mock("@/lib/commerce/sellableCatalogForInvoice", () => ({
  fetchSellableCatalogForInvoice: hoisted.fetchSellableCatalogForInvoice,
}));

vi.mock("@/lib/ai/provider", () => ({
  aiInvoiceSavings: hoisted.aiInvoiceSavings,
}));

vi.mock("@/lib/ai/telemetry", () => ({
  logAiEvent: vi.fn().mockResolvedValue(undefined),
}));

function req(body: unknown) {
  return new NextRequest("http://localhost/api/ai/invoice/recommend", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const lines = [{ description: "item", quantity: 1, unit_price: 10, total: 10 }];

describe("POST /api/ai/invoice/recommend", () => {
  beforeEach(() => {
    hoisted.fetchSellableCatalogForInvoice.mockReset();
    hoisted.aiInvoiceSavings.mockReset();
  });

  it("returns 503 CATALOG_UNAVAILABLE when catalog query throws and does not call aiInvoiceSavings", async () => {
    hoisted.fetchSellableCatalogForInvoice.mockRejectedValue(new Error("db down"));
    const res = await POST(req({ lines }));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.code).toBe("CATALOG_UNAVAILABLE");
    expect(hoisted.aiInvoiceSavings).not.toHaveBeenCalled();
  });

  it("returns 503 CATALOG_UNAVAILABLE when catalog is empty and does not call aiInvoiceSavings", async () => {
    hoisted.fetchSellableCatalogForInvoice.mockResolvedValue([]);
    const res = await POST(req({ lines }));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.code).toBe("CATALOG_UNAVAILABLE");
    expect(hoisted.aiInvoiceSavings).not.toHaveBeenCalled();
  });

  it("returns 422 RECOMMENDATION_VALIDATION_FAILED when model returns bogus recommended_sku", async () => {
    hoisted.fetchSellableCatalogForInvoice.mockResolvedValue([
      { sku: "SKU1", displayName: "A", listPriceCents: 1000 },
    ]);
    hoisted.aiInvoiceSavings.mockResolvedValue({
      ok: true,
      data: {
        total_current_estimate: 10,
        total_recommended_estimate: 10,
        estimated_savings: 0,
        swaps: [
          {
            line_index: 0,
            current_description: "item",
            recommended_sku: "NOT_REAL",
            recommended_name: "X",
            brand: null,
            estimated_savings: null,
            reason: "r",
            confidence: 0.5,
          },
        ],
      },
    });
    const res = await POST(req({ lines }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.code).toBe("RECOMMENDATION_VALIDATION_FAILED");
    expect(json).not.toHaveProperty("swaps");
  });

  it("returns 200 with payload when model output validates", async () => {
    hoisted.fetchSellableCatalogForInvoice.mockResolvedValue([
      { sku: "SKU1", displayName: "A", listPriceCents: 800 },
    ]);
    hoisted.aiInvoiceSavings.mockResolvedValue({
      ok: true,
      data: {
        total_current_estimate: 10,
        total_recommended_estimate: 8,
        estimated_savings: 2,
        swaps: [
          {
            line_index: 0,
            current_description: "item",
            recommended_sku: "SKU1",
            recommended_name: "A",
            brand: null,
            estimated_savings: null,
            reason: "r",
            confidence: 0.9,
          },
        ],
      },
    });
    const res = await POST(req({ lines }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.swaps).toHaveLength(1);
    expect(json.swaps[0].recommended_sku).toBe("SKU1");
    expect(json.estimated_savings).toBe(2);
  });
});
