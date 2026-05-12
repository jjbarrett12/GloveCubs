import { describe, expect, it } from "vitest";
import {
  adaptUrlImportJobDetail,
  adaptUrlImportJobList,
  adaptUrlImportJobSummary,
  isTerminalStatus,
  normalizeUrlImportStatus,
} from "@/lib/admin/url-import-adapter";

describe("normalizeUrlImportStatus", () => {
  it("maps CatalogOS-known statuses to canonical ones", () => {
    expect(normalizeUrlImportStatus("queued").status).toBe("queued");
    expect(normalizeUrlImportStatus("running").status).toBe("running");
    expect(normalizeUrlImportStatus("crawling").status).toBe("running");
    expect(normalizeUrlImportStatus("completed").status).toBe("completed");
    expect(normalizeUrlImportStatus("finished").status).toBe("completed");
    expect(normalizeUrlImportStatus("failed").status).toBe("failed");
    expect(normalizeUrlImportStatus("cancelled").status).toBe("canceled");
  });

  it("returns unknown for missing or surprise values without inventing truth", () => {
    expect(normalizeUrlImportStatus("").status).toBe("unknown");
    expect(normalizeUrlImportStatus(null).status).toBe("unknown");
    expect(normalizeUrlImportStatus("synthesizing-ai-output").status).toBe("unknown");
    expect(normalizeUrlImportStatus("synthesizing-ai-output").raw).toBe("synthesizing-ai-output");
  });

  it("terminal helper reports completed/failed/canceled only", () => {
    expect(isTerminalStatus("completed")).toBe(true);
    expect(isTerminalStatus("failed")).toBe(true);
    expect(isTerminalStatus("canceled")).toBe(true);
    expect(isTerminalStatus("running")).toBe(false);
    expect(isTerminalStatus("queued")).toBe(false);
    expect(isTerminalStatus("unknown")).toBe(false);
  });
});

describe("adaptUrlImportJobSummary", () => {
  it("normalizes the CatalogOS list shape", () => {
    const adapted = adaptUrlImportJobSummary({
      id: "job-abc-123",
      supplier_name: "Acme",
      start_url: "https://example.com/cat",
      allowed_domain: "example.com",
      crawl_mode: "category",
      max_pages: 25,
      status: "running",
      pages_discovered: 12,
      pages_crawled: 8,
      product_pages_detected: 5,
      products_extracted: 3,
      family_groups_inferred: 1,
      failed_pages_count: 0,
      warnings: ["robots-txt slow"],
      import_batch_id: null,
      started_at: "2026-05-11T10:00:00Z",
      finished_at: null,
      created_at: "2026-05-11T09:59:00Z",
    });
    expect(adapted).not.toBeNull();
    expect(adapted!.id).toBe("job-abc-123");
    expect(adapted!.status).toBe("running");
    expect(adapted!.productsExtracted).toBe(3);
    expect(adapted!.warnings).toEqual(["robots-txt slow"]);
  });

  it("returns null when id is missing", () => {
    expect(adaptUrlImportJobSummary({ supplier_name: "x" })).toBeNull();
  });
});

describe("adaptUrlImportJobList", () => {
  it("handles array, {jobs}, {data} response envelopes", () => {
    expect(adaptUrlImportJobList([{ id: "j-aaaaaa", status: "completed" }])).toHaveLength(1);
    expect(adaptUrlImportJobList({ jobs: [{ id: "j-bbbbbb", status: "queued" }] })).toHaveLength(1);
    expect(adaptUrlImportJobList({ data: [{ id: "j-cccccc", status: "failed" }] })).toHaveLength(1);
    expect(adaptUrlImportJobList(null)).toEqual([]);
  });
});

describe("adaptUrlImportJobDetail", () => {
  it("normalizes products, images, attributes, duplicates, and warnings without fabricating data", () => {
    const detail = adaptUrlImportJobDetail({
      job: {
        id: "job-detail-1",
        supplier_name: "Acme",
        start_url: "https://example.com/p/1",
        crawl_mode: "single_product",
        status: "completed",
        products_extracted: 1,
        warnings: ["one job warning"],
        created_at: "2026-05-11T11:00:00Z",
        finished_at: "2026-05-11T11:01:00Z",
      },
      products: [
        {
          id: "prod-1",
          source_url: "https://example.com/p/1",
          confidence: 0.82,
          ai_used: true,
          family_group_key: "fam-1",
          inferred_base_sku: "BASE-1",
          inferred_size: "L",
          extraction_method: "ai",
          normalized_payload: {
            name: "Nitrile Glove",
            brand: "Acme",
            sku: "ACM-NIT-L",
            manufacturer_part_number: "MPN-1",
            upc: "012345678905",
            image_url: "https://cdn.example.com/a.jpg",
            images: ["https://cdn.example.com/a.jpg", "https://cdn.example.com/b.jpg"],
            material: "nitrile",
            size: "L",
            color: "blue",
            thickness_mil: 4,
            warnings: ["missing description"],
            potential_duplicates: [
              {
                canonical_product_id: "cp-1",
                product_name: "Acme Nitrile L",
                similarity_score: 0.91,
                match_reasons: ["sku_match", "brand_match"],
              },
            ],
          },
        },
      ],
      familyGroups: [
        {
          family_group_key: "fam-1",
          inferred_base_sku: "BASE-1",
          count: 1,
          products: [{ id: "prod-1" }],
        },
      ],
    });
    expect(detail).not.toBeNull();
    expect(detail!.job.status).toBe("completed");
    expect(detail!.job.warnings).toEqual(["one job warning"]);
    expect(detail!.products).toHaveLength(1);
    const p = detail!.products[0];
    expect(p.title).toBe("Nitrile Glove");
    expect(p.brand).toBe("Acme");
    expect(p.sku).toBe("ACM-NIT-L");
    expect(p.mpn).toBe("MPN-1");
    expect(p.gtin).toBe("012345678905");
    expect(p.images).toEqual([
      "https://cdn.example.com/a.jpg",
      "https://cdn.example.com/b.jpg",
    ]);
    expect(p.attributes.map((a) => a.key)).toEqual(
      expect.arrayContaining(["Material", "Size", "Color"])
    );
    expect(p.warnings).toEqual(["missing description"]);
    expect(p.duplicateCandidates).toHaveLength(1);
    expect(p.duplicateCandidates[0].similarity).toBe(0.91);
    expect(p.confidence).toBeCloseTo(0.82);
    expect(detail!.familyGroups[0].productIds).toEqual(["prod-1"]);
  });

  it("ignores invalid image protocols and tolerates missing payload", () => {
    const detail = adaptUrlImportJobDetail({
      job: { id: "j-1", status: "completed" },
      products: [
        {
          id: "p-1",
          normalized_payload: { name: "x", images: ["javascript:alert(1)", "ftp://x"], image_url: null },
        },
      ],
    });
    expect(detail).not.toBeNull();
    expect(detail!.products[0].images).toEqual([]);
  });

  it("does not invent duplicate candidates when CatalogOS omits them", () => {
    const detail = adaptUrlImportJobDetail({
      job: { id: "j-1", status: "completed" },
      products: [{ id: "p-1", normalized_payload: { name: "x" } }],
    });
    expect(detail!.products[0].duplicateCandidates).toEqual([]);
    expect(detail!.products[0].warnings).toEqual([]);
  });
});
