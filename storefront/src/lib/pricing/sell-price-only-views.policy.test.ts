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

const MIGRATION_222 = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20261227122200_offer_published_list_approval.sql"
);
const MIGRATION_223 = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20261227122300_invalidate_unsafe_published_list.sql"
);
const MIGRATION_224 = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20261227122400_offer_landed_cost_provenance.sql"
);

describe("sell-price-only listing and PA V2 views", () => {
  const sql220 = readFileSync(MIGRATION_220, "utf8");
  const sql221 = readFileSync(MIGRATION_221, "utf8");
  const sql222 = readFileSync(MIGRATION_222, "utf8");
  const sql223 = readFileSync(MIGRATION_223, "utf8");
  const sql224 = readFileSync(MIGRATION_224, "utf8");

  it("does not COALESCE sell_price to cost in unapplied migrations", () => {
    expect(sql220).not.toMatch(/COALESCE\s*\(\s*so\.sell_price\s*,\s*so\.cost\s*\)/i);
    expect(sql220).not.toMatch(/COALESCE\s*\(\s*sell_price\s*,\s*cost\s*\)/i);
    expect(sql221).not.toMatch(/COALESCE\s*\(\s*so\.sell_price\s*,\s*so\.cost\s*\)/i);
    expect(sql222).not.toMatch(/COALESCE\s*\(\s*so\.sell_price\s*,\s*so\.cost\s*\)/i);
    expect(sql223).not.toMatch(/COALESCE\s*\(\s*so\.sell_price\s*,\s*so\.cost\s*\)/i);
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

  it("222 requires sell_price_verified_at and never backfills approval", () => {
    expect(sql222).toContain("sell_price_verified_at");
    expect(sql222).toContain("AND so.sell_price_verified_at IS NOT NULL");
    expect(sql222).toContain("AND sell_price_verified_at IS NOT NULL");
    expect(sql222).not.toMatch(/UPDATE\s+catalogos\.supplier_offers[\s\S]*sell_price_verified_at/i);
    expect(sql222).not.toMatch(/COALESCE\s*\(\s*so\.sell_price\s*,\s*so\.cost\s*\)/i);
  });

  it("223 invalidates approval on unsafe cost change and does not rewrite list or mapping", () => {
    expect(sql223).toContain("catalogos.minimum_safe_published_list");
    expect(sql223).toContain("CEIL(ROUND(p_cost * 100) / 0.56::numeric - 0.000000001)");
    expect(sql223).toContain("NEW.sell_price_verified_at := NULL");
    expect(sql223).toContain("NEW.sell_price_verified_by := NULL");
    expect(sql223).toContain("OLD.cost IS DISTINCT FROM NEW.cost");
    expect(sql223).toContain("RAISE EXCEPTION 'below_minimum_margin'");
    expect(sql223).not.toMatch(/NEW\.sell_price\s*:?=/);
    expect(sql223).not.toMatch(/NEW\.catalog_variant_id\s*:?=/);
    expect(sql223).not.toMatch(/COALESCE\s*\(\s*so\.sell_price\s*,\s*so\.cost\s*\)/i);
  });

  it("224 adds cost provenance and does not approve or copy list", () => {
    expect(sql224).toContain("cost_source_type");
    expect(sql224).toContain("cost_source_reference");
    expect(sql224).toContain("cost_updated_at");
    expect(sql224).toContain("cost_updated_by");
    expect(sql224).toContain("LANDed CASE COST");
    expect(sql224).not.toMatch(/sell_price_verified_at/i);
    expect(sql224).not.toMatch(/COALESCE\s*\(\s*so\.sell_price\s*,\s*so\.cost\s*\)/i);
  });
});
