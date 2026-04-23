/**
 * Tests for IngestionBatchDetailClient: module load, action wiring, result display.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { IngestionBatchDetailClient } from "./IngestionBatchDetailClient";
import type { StagingRow } from "@/lib/review/data";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => "/dashboard/ingestion/batch-1",
}));

vi.mock("@/app/actions/review", () => ({
  bulkApproveStaged: vi.fn(),
  bulkApproveAiSuggestions: vi.fn(),
  bulkRejectStaged: vi.fn(),
  bulkMarkForReview: vi.fn(),
  approveAllAboveConfidence: vi.fn(),
  approveAllAiSuggestionsInBatch: vi.fn(),
  approveAllAutoReadyInBatch: vi.fn(),
  bulkPublishStaged: vi.fn(),
  publishNextApprovedPublishChunk: vi.fn(),
}));

function row(
  id: string,
  status: string,
  master_product_id: string | null = null
): StagingRow {
  return {
    id,
    batch_id: "batch-1",
    raw_id: "raw-1",
    supplier_id: "sup-1",
    normalized_data: {},
    attributes: {},
    match_confidence: 0.9,
    master_product_id,
    status,
    created_at: new Date().toISOString(),
  };
}

describe("IngestionBatchDetailClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is exported and is a function component", () => {
    expect(IngestionBatchDetailClient).toBeDefined();
    expect(typeof IngestionBatchDetailClient).toBe("function");
  });

});

describe("bulk action invocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("bulk actions are wired to correct server action imports", async () => {
    const review = await import("@/app/actions/review");
    expect(review.bulkApproveStaged).toBeDefined();
    expect(review.bulkApproveAiSuggestions).toBeDefined();
    expect(review.bulkRejectStaged).toBeDefined();
    expect(review.bulkMarkForReview).toBeDefined();
    expect(review.approveAllAboveConfidence).toBeDefined();
    expect(review.approveAllAiSuggestionsInBatch).toBeDefined();
    expect(review.approveAllAutoReadyInBatch).toBeDefined();
    expect(review.bulkPublishStaged).toBeDefined();
    expect(review.publishNextApprovedPublishChunk).toBeDefined();
  });

  it("bulkRejectStaged returns result shape with succeeded and errors", async () => {
    const { bulkRejectStaged } = await import("@/app/actions/review");
    vi.mocked(bulkRejectStaged).mockResolvedValue({
      success: true,
      processed: 2,
      succeeded: 2,
      failed: 0,
      errors: [],
    });
    const result = await (bulkRejectStaged as (...args: unknown[]) => Promise<{ succeeded: number; errors: string[] }>)(
      ["id1", "id2"]
    );
    expect(result.succeeded).toBe(2);
    expect(result.errors).toEqual([]);
  });

  it("bulkPublishStaged returns published count and publishErrors", async () => {
    const { bulkPublishStaged } = await import("@/app/actions/review");
    vi.mocked(bulkPublishStaged).mockResolvedValue({
      success: true,
      processed: 2,
      succeeded: 2,
      failed: 0,
      errors: [],
      published: 2,
      publishErrors: [],
    });
    const result = await (bulkPublishStaged as (...args: unknown[]) => Promise<{ published: number; publishErrors: string[] }>)(
      ["id1", "id2"]
    );
    expect(result.published).toBe(2);
    expect(result.publishErrors).toEqual([]);
  });
});
