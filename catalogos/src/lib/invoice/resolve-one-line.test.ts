import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolveOneInvoiceLine } from "@/lib/invoice/resolve-one-line";

const matchToMaster = vi.fn();

vi.mock("@/lib/ingestion/match-service", () => ({
  matchToMaster: (...args: unknown[]) => matchToMaster(...args),
}));

vi.mock("@/lib/db/client", () => ({
  getSupabaseCatalogos: () => ({
    from: (table: string) => {
      if (table !== "categories") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: { id: "11111111-1111-4111-8111-111111111111" }, error: null }),
          }),
        }),
      };
    },
  }),
}));

describe("resolveOneInvoiceLine", () => {
  beforeEach(() => {
    matchToMaster.mockReset();
  });

  it("runs real runNormalization then matchToMaster and returns structured output", async () => {
    matchToMaster.mockResolvedValue({
      matched: true,
      masterProductId: "22222222-2222-4222-8222-222222222222",
      confidence: 0.92,
      reason: "upc_exact",
    });

    const out = await resolveOneInvoiceLine("line-1", {
      description: "Nitrile exam gloves medium 100/bx",
      name: "Nitrile exam gloves medium 100/bx",
      product_name: "Nitrile exam gloves medium 100/bx",
      sku: "GLOVE-NIT-M-100",
      supplier_sku: "GLOVE-NIT-M-100",
      price: 12.5,
      cost: 12.5,
      unit_cost: 12.5,
      quantity: 10,
    });

    expect(out.line_id).toBe("line-1");
    expect(out.matched).toBe(true);
    expect(out.catalog_product_id).toBe("22222222-2222-4222-8222-222222222222");
    expect(out.match_reason).toBe("upc_exact");
    expect(out.normalized_snapshot).toMatchObject({ category_slug: expect.any(String) });
    expect(matchToMaster).toHaveBeenCalledTimes(1);
    const arg = matchToMaster.mock.calls[0]![0] as { normalized: { name?: string }; categoryId: string };
    expect(arg.categoryId).toBe("11111111-1111-4111-8111-111111111111");
    expect(arg.normalized.name).toBeTruthy();
  });

  it("returns no_match with confidence 0 when matchToMaster yields no_match", async () => {
    matchToMaster.mockResolvedValue({
      matched: false,
      masterProductId: null,
      confidence: 0,
      reason: "no_match",
    });
    const out = await resolveOneInvoiceLine("line-bad", {
      description: "Nitrile gloves medium",
      name: "Nitrile gloves medium",
      product_name: "Nitrile gloves medium",
      sku: "SKU-X",
      supplier_sku: "SKU-X",
      price: 1,
      cost: 1,
      unit_cost: 1,
      quantity: 1,
    });
    expect(out.matched).toBe(false);
    expect(out.match_reason).toBe("no_match");
    expect(out.match_confidence).toBe(0);
    expect(matchToMaster).toHaveBeenCalled();
  });
});
