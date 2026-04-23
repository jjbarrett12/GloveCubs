/**
 * Tests for product_attributes sync: empty input, single/multi value handling contract.
 * Full sync is integration-tested with Supabase.
 */

import { describe, it, expect } from "vitest";
import { syncProductAttributesFromStaged } from "./product-attribute-sync";

describe("product-attribute-sync", () => {
  it("returns synced 0 and no errors when filterAttributes empty or only empty values", async () => {
    const r1 = await syncProductAttributesFromStaged("product-id", "category-id", {});
    expect(r1.synced).toBe(0);
    expect(r1.errors).toEqual([]);

    const r2 = await syncProductAttributesFromStaged("product-id", "category-id", {
      material: undefined,
      size: null,
      color: "",
    });
    expect(r2.synced).toBe(0);
    expect(r2.errors).toEqual([]);
  });

    it("reports errors when attribute_definition missing for category (unknown key)", async () => {
    const hasSupabase = !!(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!hasSupabase) return;
    const result = await syncProductAttributesFromStaged("product-id", "category-id", {
      unknown_key: "value",
    });
    expect(result.synced).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.includes("attribute_definition") || e.includes("unknown_key"))).toBe(true);
  });
});
