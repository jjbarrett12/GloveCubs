import { describe, expect, it } from "vitest";
import {
  CLIPBOARD_EXTRACTION_AUTHORITY_CATALOGOS,
} from "@/lib/admin/clipboard-url-catalogos-extract";
import {
  buildUrlImportBridgeSuccessLinks,
  parseClipboardCatalogosStagingRef,
  storefrontReviewQueuePath,
  storefrontUrlImportBridgeApiPath,
} from "@/lib/admin/clipboard-staging-catalogos-bridge";

describe("clipboard-staging-catalogos-bridge", () => {
  it("parses CatalogOS staging ref only for catalogos extraction authority", () => {
    const ref = parseClipboardCatalogosStagingRef({
      catalogos_job_id: "job-1",
      catalogos_product_id: "prod-1",
      extraction_authority: CLIPBOARD_EXTRACTION_AUTHORITY_CATALOGOS,
    });
    expect(ref).toEqual({
      jobId: "job-1",
      productId: "prod-1",
      extractionAuthority: CLIPBOARD_EXTRACTION_AUTHORITY_CATALOGOS,
    });
    expect(
      parseClipboardCatalogosStagingRef({
        catalogos_job_id: "job-1",
        catalogos_product_id: "prod-1",
        extraction_authority: "storefront_product_extraction_v2",
      })
    ).toBeNull();
    expect(parseClipboardCatalogosStagingRef({ catalogos_job_id: "job-1" })).toBeNull();
  });

  it("builds storefront bridge and review queue paths", () => {
    expect(storefrontUrlImportBridgeApiPath("job-abc")).toBe(
      "/admin/api/products/import/url/jobs/job-abc/bridge"
    );
    expect(storefrontReviewQueuePath("batch-xyz")).toBe(
      "/admin/products/review?batchId=batch-xyz"
    );
  });

  it("prefers CatalogOS batch review as primary bridge success link", () => {
    const links = buildUrlImportBridgeSuccessLinks({
      catalogosBaseUrl: "https://catalogos.example",
      batchId: "batch-1",
      jobId: "job-1",
    });
    expect(links.primaryHref).toBe(
      "https://catalogos.example/dashboard/review?batch_id=batch-1"
    );
    expect(links.primaryExternal).toBe(true);
    expect(links.secondaryHref).toBe("/admin/products/review?batchId=batch-1");
    expect(links.jobHref).toContain("/dashboard/url-import/job-1");
  });

  it("falls back to storefront review when catalogos base URL is missing", () => {
    const links = buildUrlImportBridgeSuccessLinks({
      catalogosBaseUrl: "",
      batchId: "batch-1",
    });
    expect(links.primaryHref).toBe("/admin/products/review?batchId=batch-1");
    expect(links.primaryExternal).toBe(false);
    expect(links.secondaryHref).toBeNull();
  });
});
