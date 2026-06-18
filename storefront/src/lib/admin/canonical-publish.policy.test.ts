import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("canonical publish enforcement", () => {
  it("product-write blocks manual active publish via canonical policy", () => {
    const s = readFileSync(join(__dirname, "product-write.ts"), "utf8");
    expect(s).toContain("evaluateStorefrontManualActivePublishGuard");
    expect(s).toContain("URL_IMPORT_CATALOGOS_PUBLISH_REQUIRED_MESSAGE");
    expect(s).not.toMatch(/\brunPublish\b/);
  });

  it("product editor shell surfaces CatalogOS publish link when blocked", () => {
    const shell = readFileSync(
      join(__dirname, "../../app/admin/products/_components/ProductEditorShell.tsx"),
      "utf8"
    );
    expect(shell).toContain("storefrontPublishBlocked");
    expect(shell).toContain("CatalogOS publish required");
  });

  it("review page labels CatalogOS runPublish as canonical", () => {
    const page = readFileSync(join(__dirname, "../../app/admin/products/review/page.tsx"), "utf8");
    expect(page).toContain("Canonical publish");
    expect(page).toContain("runPublish");
  });

  it("does not write launch products to legacy public.products", () => {
    const write = readFileSync(join(__dirname, "product-write.ts"), "utf8");
    expect(write).not.toMatch(/from\(["']public["']\)\.from\(["']products["']\)/);
    expect(write).toContain('"catalog_v2"');
  });
});
