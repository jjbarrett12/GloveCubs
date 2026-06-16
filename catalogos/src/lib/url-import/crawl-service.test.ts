import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  getSupabaseCatalogos: () => ({ from: db.from }),
}));

vi.mock("@/lib/openclaw/fetch", () => ({
  safeFetchHtml: vi.fn(),
}));

vi.mock("./telemetry", () => ({
  emitUrlImportEvent: vi.fn(),
}));

function jobSelectChain(job: Record<string, unknown>) {
  return {
    select: () => ({
      eq: () => ({
        single: () => Promise.resolve({ data: job, error: null }),
      }),
    }),
  };
}

function updateChain() {
  return {
    update: () => ({
      eq: () => Promise.resolve({ error: null }),
    }),
  };
}

describe("url-import crawl-service", () => {
  beforeEach(() => {
    db.from.mockReset();
  });

  it("createUrlImportJob inserts into url_import_jobs via catalogos client", async () => {
    db.from.mockImplementation((table: string) => {
      expect(table).toBe("url_import_jobs");
      return {
        insert: (row: Record<string, unknown>) => {
          expect(row.status).toBe("pending");
          return {
            select: () => ({
              single: () => Promise.resolve({ data: { id: "job-create-1" }, error: null }),
            }),
          };
        },
      };
    });

    const { createUrlImportJob } = await import("./crawl-service");
    const result = await createUrlImportJob({
      supplierId: "11111111-1111-4111-8111-111111111111",
      supplierName: "Acme",
      startUrl: "https://example.com/product/glove",
      allowedDomain: "example.com",
      crawlMode: "single_product",
      maxPages: 1,
    });

    expect(result.jobId).toBe("job-create-1");
  });

  it("runUrlImportCrawl marks job failed and returns errors when category start fetch fails", async () => {
    const { safeFetchHtml } = await import("@/lib/openclaw/fetch");
    vi.mocked(safeFetchHtml).mockResolvedValue({ ok: false, html: null, error: "blocked by robots" });

    db.from.mockImplementation((table: string) => {
      if (table === "url_import_jobs") {
        return {
          ...jobSelectChain({
            id: "job-fail-1",
            supplier_id: "11111111-1111-4111-8111-111111111111",
            start_url: "https://example.com/category/gloves",
            allowed_domain: "example.com",
            crawl_mode: "category",
            max_pages: 5,
          }),
          ...updateChain(),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const { runUrlImportCrawl } = await import("./crawl-service");
    const result = await runUrlImportCrawl("job-fail-1");

    expect(result.errors).toContain("blocked by robots");
    expect(result.failedPagesCount).toBe(1);
    expect(db.from).toHaveBeenCalledWith("url_import_jobs");
  });
});
