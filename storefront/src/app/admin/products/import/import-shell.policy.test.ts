import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Product import shell page", () => {
  it("shows offline copy and does not fake job counts", () => {
    const p = join(__dirname, "page.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("Catalog sync is offline");
    expect(s).toContain("computeProductsImportConnectionStatus");
    expect(s).not.toMatch(/jobCount|jobs_extracted|mockRows/i);
  });
});
