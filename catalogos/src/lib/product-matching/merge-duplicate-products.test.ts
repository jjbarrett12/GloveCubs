import { describe, it, expect, vi, afterEach } from "vitest";
import * as dbClient from "@/lib/db/client";
import { mergeDuplicateProducts } from "./match-runs";

const PRODUCT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PRODUCT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("mergeDuplicateProducts catalog_variant_id", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockOffers(rows: Array<Record<string, unknown>>) {
    const movePatches: Record<string, unknown>[] = [];
    const supabase = {
      from: vi.fn((table: string) => {
        if (table !== "supplier_offers") {
          throw new Error(`unexpected table ${table}`);
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ data: rows, error: null }),
          })),
          update: vi.fn((patch: Record<string, unknown>) => {
            movePatches.push(patch);
            return { eq: vi.fn().mockResolvedValue({ error: null }) };
          }),
        };
      }),
      schema: vi.fn(() => ({
        from: vi.fn(() => ({
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
        })),
      })),
    };
    vi.spyOn(dbClient, "getSupabaseCatalogos").mockReturnValue(supabase as never);
    return { movePatches };
  }

  it("clears catalog_variant_id when moving a mapped offer to another product", async () => {
    const { movePatches } = mockOffers([
      {
        id: "off-mapped",
        cost: 10,
        sell_price: 12,
        currency_code: "USD",
        cost_basis: "per_case",
        units_per_case: 100,
      },
    ]);

    const result = await mergeDuplicateProducts(PRODUCT_B, PRODUCT_A);
    expect(result.success).toBe(true);
    expect(result.offersMoved).toBe(1);
    expect(movePatches[0]).toMatchObject({
      product_id: PRODUCT_B,
      catalog_variant_id: null,
    });
  });

  it("clears catalog_variant_id even when the offer was already unmapped", async () => {
    const { movePatches } = mockOffers([
      {
        id: "off-unmapped",
        cost: 8,
        sell_price: 9,
        currency_code: "USD",
        cost_basis: "per_case",
        units_per_case: 100,
      },
    ]);

    const result = await mergeDuplicateProducts(PRODUCT_B, PRODUCT_A);
    expect(result.success).toBe(true);
    expect(movePatches[0]!.catalog_variant_id).toBeNull();
    expect(movePatches[0]!.product_id).toBe(PRODUCT_B);
  });

  it("clears FK on every moved offer (mapped and unmapped together)", async () => {
    const { movePatches } = mockOffers([
      {
        id: "off-1",
        cost: 10,
        sell_price: 12,
        currency_code: "USD",
        cost_basis: "per_case",
        units_per_case: 100,
      },
      {
        id: "off-2",
        cost: 11,
        sell_price: 13,
        currency_code: "USD",
        cost_basis: "per_case",
        units_per_case: 100,
      },
    ]);

    const result = await mergeDuplicateProducts(PRODUCT_B, PRODUCT_A);
    expect(result.success).toBe(true);
    expect(result.offersMoved).toBe(2);
    expect(movePatches).toHaveLength(2);
    for (const patch of movePatches) {
      expect(patch.product_id).toBe(PRODUCT_B);
      expect(patch.catalog_variant_id).toBeNull();
      expect(patch).not.toHaveProperty("sell_price");
    }
  });
});
