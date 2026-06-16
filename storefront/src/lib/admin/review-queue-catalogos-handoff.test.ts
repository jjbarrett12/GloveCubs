import { describe, expect, it } from "vitest";
import {
  catalogosReviewBatchUrl,
  isCatalogosUrlImportUnifiedRow,
  parseIngestionJobLineage,
} from "@/lib/admin/review-queue-catalogos-handoff";

describe("parseIngestionJobLineage", () => {
  it("extracts url import ids from ingestion_jobs.lineage", () => {
    expect(
      parseIngestionJobLineage({
        url_import_job_id: "job-1",
        url_import_product_id: "prod-1",
        import_batch_id: "batch-1",
      })
    ).toEqual({
      url_import_job_id: "job-1",
      url_import_product_id: "prod-1",
      import_batch_id: "batch-1",
    });
  });
});

describe("isCatalogosUrlImportUnifiedRow", () => {
  it("is true when catalogosUrlImportJobId is set", () => {
    expect(isCatalogosUrlImportUnifiedRow({ catalogosUrlImportJobId: "job-1" })).toBe(true);
    expect(isCatalogosUrlImportUnifiedRow({ catalogosUrlImportJobId: null })).toBe(false);
  });
});

describe("catalogosReviewBatchUrl", () => {
  it("links to CatalogOS review with batch_id query", () => {
    expect(catalogosReviewBatchUrl("https://catalogos.example", "batch-abc")).toBe(
      "https://catalogos.example/dashboard/review?batch_id=batch-abc"
    );
  });
});
