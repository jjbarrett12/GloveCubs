import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("ClipboardUrlStagingClient CatalogOS bridge UI", () => {
  const client = join(__dirname, "ClipboardUrlStagingClient.tsx");
  const bridgeHelper = join(__dirname, "../../../../../lib/admin/clipboard-staging-catalogos-bridge.ts");

  it("shows bridge CTA only when CatalogOS staging ref is parsed from extracted blob", () => {
    const s = readFileSync(client, "utf8");
    expect(s).toContain("parseClipboardCatalogosStagingRef");
    expect(s).toContain("catalogosRef");
    expect(s).toContain("Bridge to CatalogOS review");
    expect(s).toContain("Promote to draft (fallback)");
  });

  it("bridge action calls existing import proxy, not local parser or publish", () => {
    const s = readFileSync(client, "utf8");
    expect(s).toContain("storefrontUrlImportBridgeApiPath");
    expect(s).toContain("product_ids");
    expect(s).not.toContain("extractProductFromHtml");
    expect(s).not.toMatch(/\brunPublish\b/i);
    expect(s).not.toMatch(/status:\s*[\"']active[\"']/);

    const helper = readFileSync(bridgeHelper, "utf8");
    expect(helper).toContain("/admin/api/products/import/url/jobs/");
    expect(helper).toContain("/bridge");
  });

  it("bridge helper targets CatalogOS url-import bridge contract", () => {
    const s = readFileSync(bridgeHelper, "utf8");
    expect(s).toContain("CLIPBOARD_EXTRACTION_AUTHORITY_CATALOGOS");
    expect(s).toContain("catalogos_job_id");
    expect(s).toContain("catalogos_product_id");
    expect(s).not.toMatch(/\brunPublish\b/i);
    expect(s).not.toContain("extractProductFromHtml");
  });
});
