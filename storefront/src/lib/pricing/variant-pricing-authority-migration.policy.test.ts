import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const MIGRATION = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20261218120000_variant_pricing_authority_phase2b0.sql"
);

describe("variant pricing authority migration contract", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("defines variant_best_offer_price with SKU isolation join", () => {
    expect(sql).toContain("CREATE OR REPLACE VIEW catalogos.variant_best_offer_price");
    expect(sql).toContain("so.supplier_sku = v.variant_sku");
    expect(sql).toContain("so.product_id = v.catalog_product_id");
    expect(sql).toContain("so.is_active = true");
  });

  it("does not fall back to product_best_offer_price in resolve_buyer_unit_price", () => {
    const fnBody = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION gc_commerce.resolve_buyer_unit_price"));
    expect(fnBody).toContain("catalogos.variant_best_offer_price");
    expect(fnBody).not.toContain("catalogos.product_best_offer_price");
    expect(fnBody).toContain("'site_list_unavailable'");
    expect(fnBody).toContain("is_variant_specific_list");
    expect(fnBody).toContain("'site_variant_list_x_company_tier_v1'");
  });

  it("defines batch buyer RPC with max 50 cap", () => {
    expect(sql).toContain("resolve_buyer_unit_prices_batch");
    expect(sql).toContain("IF v_len > 50 THEN");
  });

  it("computes list_case_price_major in SQL only", () => {
    expect(sql).toContain("variant_case_economics_batch");
    expect(sql).toContain("v_list_case := v_list_unit * v_units");
    expect(sql).toContain("IF v_row.cost_basis = 'per_case'");
  });
});
