import { describe, it, expect, vi } from "vitest";
import { promoteSyncItemToStaging } from "./promotion-service";

vi.mock("@/lib/db/client", () => ({
  getSupabaseCatalogos: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: { message: "Not found" } })),
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
        in: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: null, error: { message: "Not found" } })) })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: { id: "new-norm-id" }, error: null })),
        })),
      })),
      update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
    })),
  })),
}));

vi.mock("@/lib/ingestion/raw-service", () => ({
  insertRawRows: vi.fn(() => Promise.resolve({ rawIds: [{ externalId: "SKU1", rawId: "raw-1" }], errors: [] })),
}));

vi.mock("@/lib/normalization/normalization-engine", () => ({
  runNormalization: vi.fn(() => ({
    content: { canonical_title: "Test", supplier_sku: "SKU1", supplier_cost: 10, category_slug: "disposable_gloves" },
    category_slug: "disposable_gloves",
    filter_attributes: {},
    review_flags: [],
    confidence_by_key: {},
    unmapped_values: [],
    category_inference: { category_slug: "disposable_gloves", confidence: 0.9 },
  })),
}));

vi.mock("@/lib/normalization/staging-payload", () => ({
  buildStagingPayload: vi.fn((input: { result: unknown; batchId: string; rawId: string; supplierId: string }) => ({
    batch_id: input.batchId,
    raw_id: input.rawId,
    supplier_id: input.supplierId,
    normalized_data: {},
    attributes: {},
    match_confidence: null,
    master_product_id: null,
    status: "pending",
  })),
}));

vi.mock("@/lib/catalogos/dictionary-service", () => ({
  loadSynonymMap: vi.fn(() => Promise.resolve({})),
}));

describe("promotion-service", () => {
  it("returns error when sync item result not found", async () => {
    const result = await promoteSyncItemToStaging("non-existent-id");
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });
});
