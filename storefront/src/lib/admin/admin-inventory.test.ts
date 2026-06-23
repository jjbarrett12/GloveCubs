import { describe, expect, it, vi } from "vitest";
import {
  adjustAdminInventory,
  INVENTORY_CANONICAL_REQUIRED,
  normalizeCanonicalUuidInput,
  VARIANT_SELECTION_REQUIRED,
} from "./admin-inventory";

const PRODUCT_ID = "00000000-0000-4000-8000-000000000001";
const VARIANT_ID = "00000000-0000-4000-8000-000000000010";
const ADMIN_ID = "00000000-0000-4000-8000-000000000099";

type InventoryHandlers = {
  inventorySelect?: () => Promise<{ data: Record<string, unknown> | null; error: null }>;
  inventoryInsert?: (row: Record<string, unknown>) => Promise<{ error: null }>;
  inventoryUpdate?: (updates: Record<string, unknown>) => Promise<{ error: null }>;
  stockHistoryInsert?: (row: Record<string, unknown>) => Promise<{ error: null }>;
  catalogSelect?: () => Promise<{ data: Record<string, unknown> | null; error: null }>;
  catalogList?: () => Promise<{ data: Record<string, unknown>[] | null; error: null }>;
  sellableSelect?: () => Promise<{ data: Record<string, unknown>[] | null; error: null }>;
  brandsSelect?: () => Promise<{ data: Record<string, unknown>[] | null; error: null }>;
};

function mockSupabase(handlers: InventoryHandlers = {}, initialOnHand = 10) {
  let inventoryOnHand = initialOnHand;
  let stockHistoryRow: Record<string, unknown> | null = null;

  const inventoryFrom = vi.fn(() => ({
    select: vi.fn((cols?: string) => {
      if (cols === "*") {
        return Promise.resolve({
          data: [
            {
              canonical_product_id: PRODUCT_ID,
              quantity_on_hand: inventoryOnHand,
              quantity_reserved: 2,
              reorder_point: 5,
              bin_location: "A1",
              last_count_at: "2026-01-01T00:00:00Z",
            },
          ],
          error: null,
        });
      }
      return {
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => {
            if (handlers.inventorySelect) {
              return handlers.inventorySelect();
            }
            return Promise.resolve({
              data: { quantity_on_hand: inventoryOnHand, quantity_reserved: 2 },
              error: null,
            });
          }),
        })),
      };
    }),
    insert: vi.fn((row: Record<string, unknown>) => {
      handlers.inventoryInsert?.(row);
      return Promise.resolve({ error: null });
    }),
    update: vi.fn((updates: Record<string, unknown>) => {
      handlers.inventoryUpdate?.(updates);
      if (updates.quantity_on_hand != null) {
        inventoryOnHand = Number(updates.quantity_on_hand);
      }
      return {
        eq: vi.fn(() => Promise.resolve({ error: null })),
      };
    }),
  }));

  const stockHistoryFrom = vi.fn(() => ({
    insert: vi.fn((row: Record<string, unknown>) => {
      stockHistoryRow = row;
      return handlers.stockHistoryInsert?.(row) ?? Promise.resolve({ error: null });
    }),
  }));

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "inventory") return inventoryFrom();
      if (table === "stock_history") return stockHistoryFrom();
      throw new Error(`unexpected public table ${table}`);
    }),
    schema: vi.fn((name: string) => {
      if (name === "catalog_v2") {
        return {
          from: vi.fn((table: string) => {
            if (table === "catalog_variants") {
              return {
                select: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      eq: vi.fn(async () => ({
                        data: [{ id: VARIANT_ID, fulfillment_mode: "stocked" }],
                        error: null,
                      })),
                    })),
                  })),
                })),
              };
            }
            if (table !== "catalog_products") throw new Error(`unexpected v2 table ${table}`);
            return {
              select: vi.fn(() => ({
                eq: vi.fn((col: string, val: unknown) => {
                  if (col === "status") {
                    return {
                      order: vi.fn(() => ({
                        limit: vi.fn(
                          () =>
                            handlers.catalogList?.() ??
                            Promise.resolve({
                              data: [
                                {
                                  id: PRODUCT_ID,
                                  internal_sku: "SKU-1",
                                  name: "Nitrile Glove",
                                  brand_id: "00000000-0000-4000-8000-000000000010",
                                },
                              ],
                              error: null,
                            }),
                        ),
                      })),
                    };
                  }
                  return {
                    maybeSingle: vi.fn(
                      () =>
                        handlers.catalogSelect?.() ??
                        Promise.resolve({
                          data: {
                            id: val,
                            internal_sku: "SKU-1",
                            name: "Nitrile Glove",
                            brand_id: "00000000-0000-4000-8000-000000000010",
                          },
                          error: null,
                        }),
                    ),
                  };
                }),
              })),
            };
          }),
        };
      }
      if (name === "gc_commerce") {
        return {
          from: vi.fn((table: string) => {
            if (table !== "sellable_products") throw new Error(`unexpected gc table ${table}`);
            return {
              select: vi.fn(() => ({
                in: vi.fn(() => ({
                  eq: vi.fn(
                    () =>
                      handlers.sellableSelect?.() ??
                      Promise.resolve({
                        data: [{ catalog_product_id: PRODUCT_ID, sku: "SKU-1" }],
                        error: null,
                      }),
                  ),
                })),
              })),
            };
          }),
        };
      }
      if (name === "catalogos") {
        return {
          from: vi.fn((table: string) => {
            if (table !== "brands") throw new Error(`unexpected catalogos table ${table}`);
            return {
              select: vi.fn(() => ({
                in: vi.fn(
                  () =>
                    handlers.brandsSelect?.() ??
                    Promise.resolve({
                      data: [{ id: "00000000-0000-4000-8000-000000000010", name: "Growl" }],
                      error: null,
                    }),
                ),
              })),
            };
          }),
        };
      }
      throw new Error(`unexpected schema ${name}`);
    }),
    rpc: vi.fn(async (name: string) => {
      if (name === "admin_adjust_variant_inventory_atomic") {
        return {
          data: { ok: true, quantity_on_hand: inventoryOnHand + 5, quantity_reserved: 2 },
          error: null,
        };
      }
      throw new Error(`unexpected rpc ${name}`);
    }),
    __getStockHistoryRow: () => stockHistoryRow,
    __getInventoryOnHand: () => inventoryOnHand,
  };

  return supabase as unknown as Parameters<typeof adjustAdminInventory>[0] & {
    __getStockHistoryRow: () => Record<string, unknown> | null;
    __getInventoryOnHand: () => number;
  };
}

describe("admin-inventory", () => {
  it("normalizeCanonicalUuidInput validates UUIDs", () => {
    expect(normalizeCanonicalUuidInput(PRODUCT_ID)).toBe(PRODUCT_ID.toLowerCase());
    expect(normalizeCanonicalUuidInput("bad")).toBeNull();
  });

  it("adjustAdminInventory rejects invalid product_id", async () => {
    const supabase = mockSupabase();
    const result = await adjustAdminInventory(supabase, ADMIN_ID, {
      product_id: "bad",
      delta: 5,
    });
    expect(result.status).toBe(400);
    expect(result.error).toContain("product_id");
  });

  it("adjustAdminInventory rejects zero delta", async () => {
    const supabase = mockSupabase();
    const result = await adjustAdminInventory(supabase, ADMIN_ID, {
      product_id: PRODUCT_ID,
      delta: 0,
    });
    expect(result.status).toBe(400);
    expect(result.error).toContain("non-zero");
  });

  it("adjustAdminInventory returns 404 when product is missing", async () => {
    const supabase = mockSupabase({
      catalogSelect: async () => ({ data: null, error: null }),
    });
    const result = await adjustAdminInventory(supabase, ADMIN_ID, {
      product_id: PRODUCT_ID,
      delta: 5,
      reason: "Test",
    });
    expect(result.status).toBe(404);
  });

  it("adjustAdminInventory returns 404 when sellable listing is missing", async () => {
    const supabase = mockSupabase({
      sellableSelect: async () => ({ data: [], error: null }),
    });
    const result = await adjustAdminInventory(supabase, ADMIN_ID, {
      product_id: PRODUCT_ID,
      delta: 5,
      reason: "Test",
    });
    expect(result.status).toBe(404);
  });

  it("adjustAdminInventory exposes INVENTORY_CANONICAL_REQUIRED code constant", () => {
    expect(INVENTORY_CANONICAL_REQUIRED).toBe("INVENTORY_CANONICAL_REQUIRED");
  });

  it("adjustAdminInventory delegates to variant RPC (no public stock_history)", async () => {
    const supabase = mockSupabase();
    const result = await adjustAdminInventory(supabase, ADMIN_ID, {
      product_id: PRODUCT_ID,
      delta: 5,
      reason: "Cycle count correction",
    });
    expect(result.error).toBeNull();
    expect(result.status).toBe(200);
    expect(result.success).toBe(true);
    expect(result.stock?.stock_on_hand).toBe(15);
    expect(supabase.rpc).toHaveBeenCalledWith(
      "admin_adjust_variant_inventory_atomic",
      expect.objectContaining({ p_catalog_variant_id: VARIANT_ID, p_reason: "Cycle count correction" }),
    );
    const history = (supabase as ReturnType<typeof mockSupabase>).__getStockHistoryRow();
    expect(history).toBeNull();
  });

  it("adjustAdminInventory requires reason", async () => {
    const supabase = mockSupabase();
    const result = await adjustAdminInventory(supabase, ADMIN_ID, {
      product_id: PRODUCT_ID,
      delta: 5,
    });
    expect(result.status).toBe(400);
    expect(result.error).toContain("reason");
  });
});
