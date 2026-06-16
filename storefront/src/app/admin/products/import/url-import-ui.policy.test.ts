import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("UrlImportPanel client component", () => {
  it("disables submit when offline and posts to /admin/api/products/import/url", () => {
    const p = join(__dirname, "_components/UrlImportPanel.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain('"/admin/api/products/import/url"');
    expect(s).toContain("offline");
    expect(s).toContain("disabled");
    expect(s).not.toMatch(/\bproductExtraction\b/);
    expect(s).not.toMatch(/\burlFetch\b/);
  });
});

describe("UrlJobDetailClient component", () => {
  it("posts only selected product_ids to bridge proxy and uses CatalogOS-first success banner", () => {
    const p = join(__dirname, "_components/UrlJobDetailClient.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("/admin/api/products/import/url/jobs/");
    expect(s).toContain("/bridge");
    expect(s).toContain("product_ids: Array.from(selected)");
    expect(s).toContain("UrlImportBridgeSuccessBanner");
    expect(s).toContain("catalogosBaseUrl");
    expect(s).not.toMatch(/\brunPublish\b/i);
  });
});
