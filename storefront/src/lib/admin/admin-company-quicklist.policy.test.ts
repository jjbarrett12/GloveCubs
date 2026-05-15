import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("admin company quicklist read/search (Phase D2)", () => {
  it("uses company_quicklist_items and catalog_v2; no procurement or favorites", () => {
    const p = join(process.cwd(), "src/lib/admin/admin-company-quicklist.ts");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("company_quicklist_items");
    expect(s).toContain("catalog_v2");
    expect(s).toContain("catalog_variants");
    expect(s).toContain("catalog_products");
    expect(s).not.toMatch(/\.from\(\s*["']procurement_reorder_memory["']\)/);
    expect(s).not.toMatch(/\.from\(\s*["']saved_lists["']\)/);
    expect(s).not.toMatch(/\.from\(\s*["']product_favorites["']\)/);
  });

  it("search returns variant-level rows (catalog_variant_id) for API consumers", () => {
    const p = join(process.cwd(), "src/lib/admin/admin-company-quicklist.ts");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("QuicklistCatalogSearchRow");
    expect(s).toContain("catalog_variant_id");
    expect(s).toContain("searchQuicklistCatalogVariants");
    expect(s).toContain(".eq(\"status\", \"active\")");
    expect(s).toContain(".eq(\"is_active\", true)");
  });
});
