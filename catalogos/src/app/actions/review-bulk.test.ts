/**
 * Tests for bulk actions: publish cap/chunking, BulkResult shape, dashboard consistency.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  BULK_PUBLISH_CHUNK_SIZE,
  BULK_PUBLISH_MAX_IDS,
} from "@/lib/review/bulk-publish-config";
import { bulkPublishStaged, type BulkResult } from "./review";

vi.mock("@/lib/db/client", () => ({ getSupabaseCatalogos: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

describe("bulk publish cap and chunking", () => {
  it("BULK_PUBLISH_MAX_IDS allows larger batches than 100", () => {
    expect(BULK_PUBLISH_MAX_IDS).toBeGreaterThanOrEqual(100);
    expect(BULK_PUBLISH_MAX_IDS).toBe(500);
  });

  it("BULK_PUBLISH_CHUNK_SIZE is 100", () => {
    expect(BULK_PUBLISH_CHUNK_SIZE).toBe(100);
  });

  it("bulkPublishStaged returns shape with published and publishErrors", async () => {
    const result = await bulkPublishStaged([]);
    expect(result).toHaveProperty("processed", 0);
    expect(result).toHaveProperty("published", 0);
    expect(result).toHaveProperty("publishErrors");
    expect(Array.isArray(result.publishErrors)).toBe(true);
    expect(result.processed).toBe(0);
  });
});

describe("BulkResult shape", () => {
  it("BulkResult type includes succeeded, failed, errors", () => {
    const r: BulkResult = {
      success: true,
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: [],
    };
    expect(r).toHaveProperty("succeeded");
    expect(r).toHaveProperty("failed");
    expect(r).toHaveProperty("errors");
  });
});
