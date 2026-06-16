import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  getSupabaseCatalogos: () => ({ from: db.from }),
}));

describe("url-import admin-data", () => {
  beforeEach(() => {
    db.from.mockReset();
  });

  it("listUrlImportJobs reads url_import_jobs for admin status", async () => {
    db.from.mockImplementation((table: string) => {
      expect(table).toBe("url_import_jobs");
      return {
        select: () => ({
          order: () => ({
            limit: () =>
              Promise.resolve({
                data: [
                  {
                    id: "job-1",
                    supplier_id: "sup-1",
                    supplier_name: "Acme",
                    start_url: "https://example.com/p",
                    allowed_domain: "example.com",
                    crawl_mode: "single_product",
                    max_pages: 1,
                    status: "failed",
                    pages_discovered: 0,
                    pages_crawled: 0,
                    pages_skipped_unchanged: 0,
                    product_pages_detected: 0,
                    products_extracted: 0,
                    ai_extractions_used: 0,
                    family_groups_inferred: 0,
                    variants_inferred: 0,
                    failed_pages_count: 1,
                    warnings: ["blocked by robots"],
                    import_batch_id: null,
                    started_at: "2026-01-01T00:00:00Z",
                    finished_at: "2026-01-01T00:01:00Z",
                    created_at: "2026-01-01T00:00:00Z",
                    created_by: null,
                  },
                ],
                error: null,
              }),
          }),
        }),
      };
    });

    const { listUrlImportJobs } = await import("./admin-data");
    const jobs = await listUrlImportJobs(10);

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.status).toBe("failed");
    expect(jobs[0]?.warnings).toContain("blocked by robots");
    expect(jobs[0]?.failed_pages_count).toBe(1);
  });

  it("getUrlImportJobDetail surfaces page-level errors for admin preview", async () => {
    db.from.mockImplementation((table: string) => {
      if (table === "url_import_jobs") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: {
                    id: "job-1",
                    supplier_id: "sup-1",
                    supplier_name: "Acme",
                    start_url: "https://example.com/p",
                    allowed_domain: "example.com",
                    crawl_mode: "category",
                    max_pages: 1,
                    status: "failed",
                    pages_discovered: 1,
                    pages_crawled: 0,
                    pages_skipped_unchanged: 0,
                    product_pages_detected: 0,
                    products_extracted: 0,
                    ai_extractions_used: 0,
                    family_groups_inferred: 0,
                    variants_inferred: 0,
                    failed_pages_count: 1,
                    warnings: ["blocked by robots"],
                    import_batch_id: null,
                    started_at: null,
                    finished_at: null,
                    created_at: "2026-01-01T00:00:00Z",
                    created_by: null,
                  },
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === "url_import_pages") {
        return {
          select: () => ({
            eq: () => ({
              order: () =>
                Promise.resolve({
                  data: [
                    {
                      id: "page-1",
                      url: "https://example.com/category/gloves",
                      page_type: "category",
                      status: "failed",
                      content_hash: null,
                      error_message: "blocked by robots",
                      crawled_at: null,
                    },
                  ],
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === "url_import_products") {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [], error: null }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const { getUrlImportJobDetail } = await import("./admin-data");
    const detail = await getUrlImportJobDetail("job-1");

    expect(detail?.job.warnings).toContain("blocked by robots");
    expect(detail?.pages[0]?.error_message).toBe("blocked by robots");
  });
});
