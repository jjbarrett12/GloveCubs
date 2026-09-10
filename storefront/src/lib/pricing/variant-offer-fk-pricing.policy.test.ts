import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const MIGRATION = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20261227122100_offer_variant_fk_pricing.sql"
);
const PA_V2 = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20261218120100_variant_pricing_authority_phase2b0.sql"
);

describe("offer variant FK pricing migration", () => {
  const sql = readFileSync(MIGRATION, "utf8");
  const pa = readFileSync(PA_V2, "utf8");

  it("adds nullable catalog_variant_id FK with SET NULL and an index", () => {
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS catalog_variant_id UUID");
    expect(sql).toContain("REFERENCES catalog_v2.catalog_variants (id)");
    expect(sql).toContain("ON DELETE SET NULL");
    expect(sql).toContain("idx_supplier_offers_catalog_variant_id");
  });

  it("does not unique-constrain catalog_variant_id (multi-supplier)", () => {
    expect(sql).not.toMatch(/UNIQUE\s*\(\s*catalog_variant_id\s*\)/i);
  });

  it("does not create a second buyer price engine", () => {
    expect(sql).not.toContain("CREATE OR REPLACE FUNCTION gc_commerce.resolve_buyer_unit_price");
    expect(sql).not.toContain("CREATE OR REPLACE FUNCTION public.gc_resolve_buyer_unit_price");
  });

  it("PA V2 still resolves list from variant_best_offer_price", () => {
    const fnBody = pa.slice(pa.indexOf("CREATE OR REPLACE FUNCTION gc_commerce.resolve_buyer_unit_price"));
    expect(fnBody).toContain("catalogos.variant_best_offer_price");
    expect(fnBody).not.toContain("catalogos.product_best_offer_price");
    expect(fnBody).toContain("is_variant_specific_list");
    expect(fnBody).toContain("'site_variant_list_x_company_tier_v1'");
  });

  it("case economics uses mapped sell_price, not SKU or cost fallback", () => {
    const fnBody = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION gc_commerce.variant_case_economics_batch"));
    expect(fnBody).toContain("so.catalog_variant_id = v.id");
    expect(fnBody).toContain("so.sell_price AS offer_price");
    expect(fnBody).not.toContain("so.supplier_sku = v.variant_sku");
    expect(fnBody).not.toMatch(/COALESCE\s*\(\s*so\.sell_price\s*,\s*so\.cost\s*\)/i);
  });
});
