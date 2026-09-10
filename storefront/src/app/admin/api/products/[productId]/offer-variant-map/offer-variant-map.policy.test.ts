import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROUTE = path.resolve(__dirname, "route.ts");

describe("offer-variant-map API policy", () => {
  const src = readFileSync(ROUTE, "utf8");

  it("requires admin and never auto-approves by SKU or AI", () => {
    expect(src).toContain("getAdminUser");
    expect(src).toContain("catalog_variant_id");
    expect(src).not.toMatch(/openai|embedding|fuzzy/i);
    expect(src).not.toContain("supplier_sku =");
  });

  it("explicit unmap still writes catalog_variant_id null", () => {
    expect(src).toContain("catalog_variant_id: nextVariantId");
  });
});
