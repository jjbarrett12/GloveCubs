import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("buyer quicklist read model (Phase D3)", () => {
  it("uses company_quicklist_items scoped by company and valid_to; joins catalog; no forbidden sources", () => {
    const p = join(process.cwd(), "src/lib/account/buyer-quicklist-read-model.ts");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("company_quicklist_items");
    expect(s).toContain(".eq(\"company_id\", companyId)");
    expect(s).toContain(".is(\"valid_to\", null)");
    expect(s).toContain("catalog_v2");
    expect(s).toContain("catalog_products");
    expect(s).toContain("catalog_variants");
    expect(s).not.toMatch(/\.from\(\s*["']procurement_reorder_memory["']\)/);
    expect(s).not.toMatch(/\.from\(\s*["']saved_lists["']\)/);
    expect(s).not.toMatch(/\.from\(\s*["']product_favorites["']\)/);
    expect(s).not.toMatch(/\.from\(\s*["']users["']\)/);
    expect(s).not.toContain("public.users");
    expect(s).not.toContain("unit_price");
    expect(s).not.toContain("list_price");
  });
});
