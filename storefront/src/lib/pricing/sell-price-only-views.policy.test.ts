import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const MIGRATION_220 = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20261227122000_competitor_crosswalk_and_governed_savings.sql"
);
const MIGRATION_221 = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20261227122100_offer_variant_fk_pricing.sql"
);

describe("sell-price-only listing and PA V2 views", () => {
  const sql220 = readFileSync(MIGRATION_220, "utf8");
  const sql221 = readFileSync(MIGRATION_221, "utf8");

  it("does not COALESCE sell_price to cost in unapplied migrations", () => {
    expect(sql220).not.toMatch(/COALESCE\s*\(\s*so\.sell_price\s*,\s*so\.cost\s*\)/i);
    expect(sql220).not.toMatch(/COALESCE\s*\(\s*sell_price\s*,\s*cost\s*\)/i);
    expect(sql221).not.toMatch(/COALESCE\s*\(\s*so\.sell_price\s*,\s*so\.cost\s*\)/i);
  });

  it("product_best_offer_price uses sell_price only", () => {
    expect(sql220).toContain("CREATE OR REPLACE VIEW catalogos.product_best_offer_price");
    expect(sql220).toContain("MIN(sell_price) AS best_price");
    expect(sql220).toContain("AND sell_price IS NOT NULL");
    expect(sql220).toContain("AND sell_price > 0");
  });

  it("unapplied 220 does not ship variant SKU-equality join", () => {
    expect(sql220).not.toContain("CREATE OR REPLACE VIEW catalogos.variant_best_offer_price");
    expect(sql220).not.toContain("so.supplier_sku = v.variant_sku");
  });

  it("221 variant_best_offer_price joins on catalog_variant_id and sell_price only", () => {
    expect(sql221).toContain("CREATE OR REPLACE VIEW catalogos.variant_best_offer_price");
    expect(sql221).toContain("so.catalog_variant_id = v.id");
    expect(sql221).toContain("MIN(so.sell_price) AS list_unit_price_major");
    expect(sql221).toContain("catalogos.supplier_offers.variant_fk_sell_v1");
    expect(sql221).not.toContain("so.supplier_sku = v.variant_sku");
    expect(sql221).not.toContain("variant_sku_sell_v1");
  });
});
