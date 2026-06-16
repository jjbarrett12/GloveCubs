import { describe, expect, it } from "vitest";
import {
  aggregateEvidenceByField,
  dedupeUnifiedQueueRows,
  modeLabel,
  type UnifiedReviewQueueRow,
} from "@/lib/admin/unified-ingestion-review-queue";
import { canPromoteUnifiedStaging } from "@/lib/admin/unified-ingestion-promote-guards";

describe("aggregateEvidenceByField", () => {
  it("keeps newest evidence per field_key", () => {
    const agg = aggregateEvidenceByField([
      {
        staging_variant_id: "v1",
        field_key: "name",
        extracted_value: "Old",
        confidence: 0.5,
        source_type: "json_ld",
        source_ref: "https://a",
        extraction_method: "deterministic",
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        staging_variant_id: "v1",
        field_key: "name",
        extracted_value: "New",
        confidence: 0.9,
        source_type: "json_ld",
        source_ref: "https://a",
        extraction_method: "deterministic",
        created_at: "2026-01-02T00:00:00Z",
      },
    ]);
    expect(agg.get("name")?.value).toBe("New");
    expect(agg.get("name")?.confidence).toBe(0.9);
  });
});

describe("dedupeUnifiedQueueRows", () => {
  it("keeps newest row per product_fingerprint", () => {
    const rows: UnifiedReviewQueueRow[] = [
      baseRow({ stagingVariantId: "a", productFingerprint: "fp1", createdAt: "2026-01-01T00:00:00Z" }),
      baseRow({ stagingVariantId: "b", productFingerprint: "fp1", createdAt: "2026-01-03T00:00:00Z" }),
    ];
    const out = dedupeUnifiedQueueRows(rows);
    expect(out).toHaveLength(1);
    expect(out[0]?.stagingVariantId).toBe("b");
  });
});

describe("canPromoteUnifiedStaging", () => {
  it("allows review_ready", () => {
    expect(
      canPromoteUnifiedStaging({
        jobStatus: "review_ready",
        reviewStatus: "needs_review",
        alreadyPromoted: false,
        confirmAwaitingHuman: false,
      }).ok
    ).toBe(true);
  });

  it("blocks failed and blocked jobs", () => {
    expect(
      canPromoteUnifiedStaging({
        jobStatus: "failed",
        reviewStatus: "needs_review",
        alreadyPromoted: false,
        confirmAwaitingHuman: false,
      }).ok
    ).toBe(false);
    expect(
      canPromoteUnifiedStaging({
        jobStatus: "blocked",
        reviewStatus: "needs_review",
        alreadyPromoted: false,
        confirmAwaitingHuman: false,
      }).ok
    ).toBe(false);
  });

  it("requires confirmation for awaiting_human", () => {
    expect(
      canPromoteUnifiedStaging({
        jobStatus: "awaiting_human",
        reviewStatus: "needs_review",
        alreadyPromoted: false,
        confirmAwaitingHuman: false,
      }).ok
    ).toBe(false);
    expect(
      canPromoteUnifiedStaging({
        jobStatus: "awaiting_human",
        reviewStatus: "needs_review",
        alreadyPromoted: false,
        confirmAwaitingHuman: true,
      }).ok
    ).toBe(true);
  });

  it("blocks CatalogOS URL import lineage rows", () => {
    expect(
      canPromoteUnifiedStaging({
        jobStatus: "review_ready",
        reviewStatus: "needs_review",
        alreadyPromoted: false,
        confirmAwaitingHuman: false,
        catalogosUrlImportJobId: "job-url-1",
      }).ok
    ).toBe(false);
  });
});

describe("modeLabel", () => {
  it("labels modes for UI badges", () => {
    expect(modeLabel("quick_draft")).toBe("Quick Draft");
    expect(modeLabel("deep_supplier_crawl")).toBe("Deep Supplier Crawl");
  });
});

function baseRow(partial: Partial<UnifiedReviewQueueRow>): UnifiedReviewQueueRow {
  return {
    rowKind: "unified",
    stagingVariantId: "v",
    stagingProductId: "p",
    jobId: "j",
    ingestionMode: "quick_draft",
    jobStatus: "review_ready",
    reviewStatus: "needs_review",
    sourceUrl: "https://example.com",
    sourceFingerprint: "sf",
    productFingerprint: "pf",
    blockedReason: null,
    duplicateOf: null,
    mediaStatus: "pending",
    title: "T",
    primaryImageUrl: null,
    promotedCatalogProductId: null,
    promotedCatalogVariantId: null,
    catalogosUrlImportJobId: null,
    catalogosUrlImportProductId: null,
    sourceBatchId: null,
    createdAt: "2026-01-01T00:00:00Z",
    evidenceByField: {},
    ...partial,
  };
}
