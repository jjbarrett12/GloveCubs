import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { applyLandedCostChangeToApproval, minimumSafePublishedList } from "./published-list-pricing";

const MIGRATION_223 = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20261227122300_invalidate_unsafe_published_list.sql"
);

describe("223 cost-increase invalidation", () => {
  const sql = readFileSync(MIGRATION_223, "utf8");

  it("clears verification on unsafe cost change and never rewrites sell_price or mapping", () => {
    expect(sql).toContain("trg_supplier_offers_kodiak_floor");
    expect(sql).toContain("OLD.cost IS DISTINCT FROM NEW.cost");
    expect(sql).toContain("NEW.sell_price_verified_at := NULL");
    expect(sql).toContain("NEW.sell_price_verified_by := NULL");
    expect(sql).toContain("RAISE EXCEPTION 'below_minimum_margin'");
    expect(sql).not.toMatch(/NEW\.catalog_variant_id\s*:?=/);
    expect(sql).not.toMatch(/NEW\.sell_price\s*:=/);
  });

  it("shares the TypeScript floor: 85 → 151.79, 90 → 160.72; 155 survives 85 not 90", () => {
    expect(minimumSafePublishedList(85)).toBe(151.79);
    expect(minimumSafePublishedList(90)).toBe(160.72);
    expect(
      applyLandedCostChangeToApproval({
        cost: 85,
        sellPrice: 155,
        verifiedAt: "2026-09-11T00:00:00Z",
        verifiedBy: "op",
      }).invalidated
    ).toBe(false);
    expect(
      applyLandedCostChangeToApproval({
        cost: 90,
        sellPrice: 155,
        verifiedAt: "2026-09-11T00:00:00Z",
        verifiedBy: "op",
      }).invalidated
    ).toBe(true);
  });
});
