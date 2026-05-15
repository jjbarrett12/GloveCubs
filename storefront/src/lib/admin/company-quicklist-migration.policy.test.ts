import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION = join(
  process.cwd(),
  "..",
  "supabase",
  "migrations",
  "20261215120000_gc_commerce_company_quicklist_items.sql"
);

describe("gc_commerce.company_quicklist_items migration (Phase D1)", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("defines company-scoped variant-first quicklist without price or user ownership", () => {
    expect(sql).toContain("gc_commerce.company_quicklist_items");
    expect(sql).toContain("catalog_variant_id");
    expect(sql).toContain("catalog_product_id");
    expect(sql).toContain("valid_to");
    expect(sql).toContain("uq_gc_quicklist_active_company_variant");
    expect(sql).toContain("idx_gc_quicklist_active_company_sort");
    expect(sql).not.toMatch(/\bunit_price\b/i);
    expect(sql).not.toMatch(/\bprice_minor\b/i);
    expect(sql).not.toMatch(/\bquantity_default\b/i);
    expect(sql).not.toMatch(/\suser_id UUID/i);
    expect(sql).toContain("created_by_user_id");
    expect(sql).not.toMatch(/FROM gc_commerce\.procurement_reorder_memory/i);
    expect(sql).not.toMatch(/REFERENCES gc_commerce\.saved_lists/i);
    expect(sql).not.toMatch(/REFERENCES public\.product_favorites/i);
  });

  it("enables buyer SELECT RLS and grants authenticated SELECT only", () => {
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("gc_quicklist_items_select_member");
    expect(sql).toContain("company_members");
    expect(sql).toContain("GRANT SELECT ON TABLE gc_commerce.company_quicklist_items TO authenticated");
    expect(sql).toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE gc_commerce.company_quicklist_items TO postgres, service_role");
    expect(sql).not.toMatch(/GRANT INSERT.*TO authenticated/i);
  });
});
