import { describe, expect, it, vi } from "vitest";
import {
  adjustAdminInventory,
  VARIANT_SELECTION_REQUIRED,
} from "./admin-inventory";
import { adjustAdminVariantInventory } from "./admin-variant-inventory";
import { receiveAdminPurchaseOrder } from "./admin-purchase-orders";
import { resolveSingleStockedVariantForProduct } from "./variant-fulfillment-admin";

const PRODUCT_ID = "00000000-0000-4000-8000-000000000001";
const VARIANT_A = "00000000-0000-4000-8000-000000000010";
const VARIANT_B = "00000000-0000-4000-8000-000000000011";
const ADMIN_ID = "00000000-0000-4000-8000-000000000099";

function buildAdjustSupabase(options: {
  stockedVariants?: { id: string }[];
  rpcOk?: boolean;
  publicInventoryUpdated?: { value: boolean };
}) {
  const publicInventoryUpdated = options.publicInventoryUpdated ?? { value: false };
  const stockedVariants = options.stockedVariants ?? [{ id: VARIANT_A }];

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "inventory") {
        return {
          select: vi.fn(() =>
            Promise.resolve({
              data: [{ canonical_product_id: PRODUCT_ID, quantity_on_hand: 10, quantity_reserved: 0 }],
              error: null,
            }),
          ),
          update: vi.fn(() => {
            publicInventoryUpdated.value = true;
            return { eq: vi.fn(() => Promise.resolve({ error: null })) };
          }),
          insert: vi.fn(() => {
            publicInventoryUpdated.value = true;
            return Promise.resolve({ error: null });
          }),
        };
      }
      if (table === "stock_history") {
        return {
          insert: vi.fn(() => {
            publicInventoryUpdated.value = true;
            return Promise.resolve({ error: null });
          }),
        };
      }
      throw new Error(`unexpected public table ${table}`);
    }),
    schema: vi.fn((name: string) => {
      if (name === "catalog_v2") {
        return {
          from: vi.fn((table: string) => {
            if (table === "catalog_products") {
              return {
                select: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({
                      data: {
                        id: PRODUCT_ID,
                        internal_sku: "GLV-SMOKE",
                        name: "Smoke Glove",
                        brand_id: null,
                      },
                      error: null,
                    })),
                  })),
                })),
              };
            }
            if (table === "catalog_variants") {
              return {
                select: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      eq: vi.fn(async () => ({
                        data: stockedVariants.map((v) => ({
                          id: v.id,
                          fulfillment_mode: "stocked",
                        })),
                        error: null,
                      })),
                    })),
                  })),
                })),
              };
            }
            throw new Error(`unexpected v2 table ${table}`);
          }),
        };
      }
      if (name === "gc_commerce") {
        return {
          from: vi.fn(() => ({
            select: vi.fn(() => ({
              in: vi.fn(() => ({
                eq: vi.fn(async () => ({
                  data: [{ catalog_product_id: PRODUCT_ID, sku: "GLV-SMOKE" }],
                  error: null,
                })),
              })),
            })),
          })),
        };
      }
      if (name === "catalogos") {
        return {
          from: vi.fn(() => ({
            select: vi.fn(() => ({
              in: vi.fn(async () => ({ data: [], error: null })),
            })),
          })),
        };
      }
      throw new Error(`unexpected schema ${name}`);
    }),
    rpc: vi.fn(async (name: string) => {
      if (name === "admin_adjust_variant_inventory_atomic") {
        return {
          data: options.rpcOk === false ? { ok: false, error: "fail" } : { ok: true, quantity_on_hand: 15, quantity_reserved: 0 },
          error: null,
        };
      }
      throw new Error(`unexpected rpc ${name}`);
    }),
  };

  return { supabase, publicInventoryUpdated };
}

describe("legacy warehouse write policy", () => {
  it("native adjust uses variant RPC only (no public.inventory write)", async () => {
    const { supabase, publicInventoryUpdated } = buildAdjustSupabase({});
    const result = await adjustAdminInventory(supabase as never, ADMIN_ID, {
      product_id: PRODUCT_ID,
      delta: 5,
      reason: "Cycle count correction",
    });
    expect(result.success).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith(
      "admin_adjust_variant_inventory_atomic",
      expect.objectContaining({ p_catalog_variant_id: VARIANT_A }),
    );
    expect(publicInventoryUpdated.value).toBe(false);
  });

  it("ambiguous multi-variant product fails safely without public.inventory write", async () => {
    const { supabase, publicInventoryUpdated } = buildAdjustSupabase({
      stockedVariants: [{ id: VARIANT_A }, { id: VARIANT_B }],
    });
    const result = await adjustAdminInventory(supabase as never, ADMIN_ID, {
      product_id: PRODUCT_ID,
      delta: 5,
      reason: "Should not apply",
    });
    expect(result.success).toBe(false);
    expect(result.code).toBe(VARIANT_SELECTION_REQUIRED);
    expect(result.status).toBe(422);
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(publicInventoryUpdated.value).toBe(false);
  });

  it("native PO receive calls variant receive RPC (not product-level receipt)", async () => {
    const poRow = {
      id: 42,
      po_number: "PO-42",
      manufacturer_id: 7,
      status: "sent",
      purchase_order_type: "inbound_stock",
      fulfillment_status: "pending",
      created_at: "2026-01-01T00:00:00Z",
      lines: [{ catalog_variant_id: VARIANT_A, quantity: 10 }],
      received_lines: [],
    };
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "purchase_orders") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: poRow, error: null })),
              })),
            })),
          };
        }
        if (table === "manufacturers") {
          return {
            select: vi.fn(() => ({
              order: vi.fn(async () => ({ data: [{ id: 7, name: "Vendor" }], error: null })),
            })),
          };
        }
        throw new Error(`unexpected table ${table}`);
      }),
      schema: vi.fn(() => ({
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      })),
      rpc: vi.fn(async () => ({
        data: { ok: true, status: "partially_received" },
        error: null,
      })),
    };
    const result = await receiveAdminPurchaseOrder(supabase as never, 42, ADMIN_ID, [
      { catalog_variant_id: VARIANT_A, quantity_received: 4 },
    ]);
    expect(result.success).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith(
      "admin_receive_purchase_order_shipment_atomic",
      expect.objectContaining({
        p_po_id: 42,
        p_lines: [{ catalog_variant_id: VARIANT_A, quantity_received: 4 }],
      }),
    );
  });

  it("dropship fulfillment PO receive is blocked before inventory RPC", async () => {
    const poRow = {
      id: 99,
      po_number: "PO-99",
      manufacturer_id: 7,
      status: "sent",
      purchase_order_type: "dropship_fulfillment",
      fulfillment_status: "pending",
      created_at: "2026-01-01T00:00:00Z",
      lines: [{ catalog_variant_id: VARIANT_A, quantity: 5 }],
      received_lines: [],
    };
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "purchase_orders") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: poRow, error: null })),
              })),
            })),
          };
        }
        if (table === "manufacturers") {
          return {
            select: vi.fn(() => ({
              order: vi.fn(async () => ({ data: [{ id: 7, name: "Vendor" }], error: null })),
            })),
          };
        }
        throw new Error(`unexpected table ${table}`);
      }),
      schema: vi.fn(() => ({
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      })),
      rpc: vi.fn(),
    };
    const result = await receiveAdminPurchaseOrder(supabase as never, 99, ADMIN_ID, [
      { catalog_variant_id: VARIANT_A, quantity_received: 5 },
    ]);
    expect(result.success).toBe(false);
    expect(result.code).toBe("PO_INVALID_TYPE");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("adjustAdminVariantInventory calls atomic variant RPC directly", async () => {
    const supabase = {
      rpc: vi.fn(async () => ({
        data: { ok: true, quantity_on_hand: 20, quantity_reserved: 1 },
        error: null,
      })),
    };
    const result = await adjustAdminVariantInventory(supabase as never, ADMIN_ID, {
      catalog_variant_id: VARIANT_A,
      delta: 3,
      reason: "Found cases",
    });
    expect(result.success).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith("admin_adjust_variant_inventory_atomic", {
      p_catalog_variant_id: VARIANT_A,
      p_operator_user_id: ADMIN_ID,
      p_delta: 3,
      p_reason: "Found cases",
      p_location_code: "default",
    });
  });

  it("resolveSingleStockedVariantForProduct rejects ambiguous SKUs", async () => {
    const { supabase } = buildAdjustSupabase({
      stockedVariants: [{ id: VARIANT_A }, { id: VARIANT_B }],
    });
    const resolved = await resolveSingleStockedVariantForProduct(supabase as never, PRODUCT_ID);
    expect(resolved.variantId).toBeNull();
    expect(resolved.code).toBe("VARIANT_SELECTION_REQUIRED");
  });
});
