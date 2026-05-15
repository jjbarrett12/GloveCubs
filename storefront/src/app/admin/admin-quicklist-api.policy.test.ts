import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("admin company quicklist API routes (Phase D2)", () => {
  it("collection route requires admin and uses company_quicklist_items", () => {
    const p = join(__dirname, "api/companies/[companyId]/quicklist-items/route.ts");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("getAdminUser");
    expect(s).toContain("401");
    expect(s).toContain("company_quicklist_items");
    expect(s).toContain("searchQuicklistCatalogVariants");
    expect(s).toContain("fetchCompanyQuicklistItems");
    expect(s).not.toContain("procurement_reorder_memory");
    expect(s).not.toContain("saved_lists");
    expect(s).not.toContain("product_favorites");
    expect(s).not.toContain("unit_price");
    expect(s).not.toContain("quantity_default");
    expect(s).toContain("company_id: companyId");
  });

  it("item route PATCH/DELETE filter by company_id and item id", () => {
    const p = join(__dirname, "api/companies/[companyId]/quicklist-items/[itemId]/route.ts");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("getAdminUser");
    expect(s).toContain(".eq(\"company_id\", companyId)");
    expect(s).toContain(".eq(\"id\", itemId)");
    expect(s).toContain("valid_to");
    expect(s).not.toContain("procurement_reorder_memory");
    expect(s).not.toContain("price");
    expect(s).not.toContain("quantity");
  });
});
