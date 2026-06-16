/**
 * Optional live smoke: catalogos.url_import_jobs is reachable and POST path primitives work.
 */

import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseCatalogos } from "@/lib/db/client";
import { createUrlImportJob, runUrlImportCrawl } from "./crawl-service";
import { getUrlImportJobDetail, listUrlImportJobs } from "./admin-data";
import { getOrCreateSupplierId } from "./supplier";

const hasDb =
  !!(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!hasDb)("url import infra (integration)", () => {
  it("uses catalogos schema for url_import_jobs (not public)", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const publicClient = createClient(url, key, { auth: { persistSession: false } });
    const catalogosClient = getSupabaseCatalogos(true);

    const pub = await publicClient.from("url_import_jobs").select("id").limit(1);
    const cat = await catalogosClient.from("url_import_jobs").select("id").limit(1);

    expect(pub.error?.message ?? "").toMatch(/public\.url_import_jobs|schema cache/i);
    expect(cat.error).toBeNull();
  });

  it("creates, crawls, lists, and reads job detail", async () => {
    const supplierId = await getOrCreateSupplierId("URL Import Infra Integration");
    const { jobId } = await createUrlImportJob({
      supplierId,
      supplierName: "URL Import Infra Integration",
      startUrl: "https://example.com/product/glove-smoke",
      allowedDomain: "example.com",
      crawlMode: "single_product",
      maxPages: 1,
      createdBy: "url-import-infra-integration",
    });

    const listed = await listUrlImportJobs(20);
    expect(listed.some((j) => j.id === jobId)).toBe(true);

    const crawl = await runUrlImportCrawl(jobId);
    expect(crawl.jobId).toBe(jobId);

    const detail = await getUrlImportJobDetail(jobId);
    expect(detail?.job.status).toMatch(/completed|failed/);
  });
});
