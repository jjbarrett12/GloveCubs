import { describe, expect, it, vi } from "vitest";
import { fetchLatestTrustedPriceObservation } from "@/lib/procurement/price-observation-queries";

/**
 * Phase 5 source semantics: savings builder uses latest trusted **company + catalog_product**
 * observation (not scoped to a single invoice_line_id). Documented here so drift from
 * "line-tied source price" is explicit if requirements change.
 */
describe("fetchLatestTrustedPriceObservation (contract)", () => {
  it("filters by company_id, catalog_product_id, trust_status — not invoice_line_id", async () => {
    const calls: string[][] = [];
    const supabase = {
      schema: () => ({
        from: (table: string) => {
          expect(table).toBe("price_observations");
          const chain: Record<string, unknown> = {};
          chain.select = () => chain;
          chain.eq = (col: string, val: unknown) => {
            calls.push([col, String(val)]);
            return chain;
          };
          chain.order = () => chain;
          chain.limit = () => chain;
          chain.maybeSingle = () =>
            Promise.resolve({
              data: {
                unit_price: 9.5,
                quantity: 1,
                observed_at: "2026-02-01T00:00:00Z",
                catalogos_supplier_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              },
              error: null,
            });
          return chain;
        },
      }),
    };

    const r = await fetchLatestTrustedPriceObservation(supabase as any, "co-1", "prod-1");
    expect(r).not.toBeNull();
    expect(r?.unit_price).toBe(9.5);
    const cols = calls.map((c) => c[0]);
    expect(cols).toContain("company_id");
    expect(cols).toContain("catalog_product_id");
    expect(cols).toContain("trust_status");
    expect(cols.some((c) => c.includes("invoice_line"))).toBe(false);
  });
});
