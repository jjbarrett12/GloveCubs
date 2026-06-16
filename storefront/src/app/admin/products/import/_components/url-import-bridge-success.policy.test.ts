import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("UrlImportBridgeSuccessBanner", () => {
  const banner = join(__dirname, "UrlImportBridgeSuccessBanner.tsx");
  const bridgeHelper = join(__dirname, "../../../../../lib/admin/clipboard-staging-catalogos-bridge.ts");

  it("uses CatalogOS-first link builder and keeps storefront review as secondary", () => {
    const s = readFileSync(banner, "utf8");
    expect(s).toContain("buildUrlImportBridgeSuccessLinks");
    expect(s).toContain("secondaryHref");
    expect(s).not.toMatch(/\brunPublish\b/i);
    expect(s).not.toMatch(/status:\s*[\"']active[\"']/);
    expect(s).not.toContain("extractProductFromHtml");
  });

  it("bridge helper prefers CatalogOS batch review when base URL is configured", () => {
    const s = readFileSync(bridgeHelper, "utf8");
    expect(s).toContain("catalogosReviewBatchUrl");
    expect(s).toContain("Open batch in CatalogOS review");
    expect(s).toContain("Storefront review (visibility)");
  });
});
