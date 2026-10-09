import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fulfillmentConfigFromRow,
  type FulfillmentMode,
  type InventoryVisibility,
} from "@/lib/fulfillment/variant-fulfillment-config";
import { normalizeCanonicalUuidInput } from "@/lib/admin/admin-inventory";

export type AdminInventoryRow = {
  product_id: string;
  canonical_product_id: string | null;
  sku: string;
  name: string;
  brand: string;
  quantity_on_hand: number;
  quantity_reserved: number;
  available_stock: number;
  reorder_point: number;
  bin_location: string;
  last_count_at: string | null;
};

const V2 = "catalog_v2";

export type AdminVariantInventoryRow = {
  catalog_variant_id: string;
  catalog_product_id: string;
  variant_sku: string;
  size_code: string | null;
  product_name: string;
  brand: string;
  fulfillment_mode: FulfillmentMode;
  inventory_tracking: boolean;
  inventory_visibility: InventoryVisibility;
  stock_enforcement: boolean;
  location_code: string;
  quantity_on_hand: number;
  quantity_reserved: number;
  available_stock: number;
  incoming_quantity: number;
  reorder_point: number;
  bin_location: string;
  last_count_at: string | null;
};

export type AdminVariantStockHistoryRow = {
  id: number;
  catalog_variant_id: string;
  variant_sku: string;
  delta: number;
  type: string;
  reference_type: string | null;
  reference_id: number | null;
  notes: string | null;
  balance_after: number | null;
  created_at: string;
  operator_user_id: string | null;
};

export type AdminDropshipCatalogRow = {
  catalog_variant_id: string;
  variant_sku: string;
  size_code: string | null;
  product_name: string;
  brand: string;
  fulfillment_mode: FulfillmentMode;
};

export type AdminIncomingPoRow = {
  id: number;
  po_number: string;
  manufacturer_name: string;
  status: string;
  created_at: string;
  line_count: number;
  pending_lines: number;
};

export type AdminVariantAdjustInput = {
  catalog_variant_id: string;
  delta: number;
  reason: string;
  location_code?: string;
};

export const VARIANT_REQUIRED = "VARIANT_REQUIRED";
export const RESERVED_EXCEEDS_ON_HAND = "RESERVED_EXCEEDS_ON_HAND";

async function loadBrandNamesByIds(
  supabase: SupabaseClient,
  brandIds: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(brandIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .schema("catalogos")
    .from("brands")
    .select("id, name")
    .in("id", ids);
  if (error) throw error;
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    map.set(String(row.id), String(row.name ?? ""));
  }
  return map;
}

function inventoryKey(variantId: string, location: string): string {
  return `${variantId}::${location}`;
}

/** Warehouse stock: tracked variants with inventory rows or explicit stocked/hybrid mode. */
export async function fetchAdminWarehouseInventory(
  supabase: SupabaseClient,
): Promise<{ rows: AdminVariantInventoryRow[]; error: string | null; status: number }> {
  try {
    const { data: variants, error: vErr } = await supabase
      .schema(V2)
      .from("catalog_variants")
      .select(
        "id, catalog_product_id, variant_sku, size_code, fulfillment_mode, inventory_tracking, inventory_visibility, stock_enforcement, default_location_code, reorder_point",
      )
      .eq("is_active", true)
      .eq("inventory_tracking", true)
      .order("variant_sku", { ascending: true })
      .limit(5000);
    if (vErr) return { rows: [], error: vErr.message, status: 500 };
    if (!variants?.length) return { rows: [], error: null, status: 200 };

    const productIds = [...new Set(variants.map((v) => String(v.catalog_product_id)))];
    const { data: products, error: pErr } = await supabase
      .schema(V2)
      .from("catalog_products")
      .select("id, name, brand_id")
      .in("id", productIds);
    if (pErr) return { rows: [], error: pErr.message, status: 500 };

    const productById = new Map(
      (products ?? []).map((p) => [String(p.id), p as Record<string, unknown>]),
    );
    const brandById = await loadBrandNamesByIds(
      supabase,
      (products ?? []).map((p) => (p.brand_id != null ? String(p.brand_id) : "")).filter(Boolean),
    );

    const variantIds = variants.map((v) => String(v.id));
    const { data: invRows, error: invErr } = await supabase
      .schema(V2)
      .from("variant_inventory")
      .select("*")
      .in("catalog_variant_id", variantIds);
    if (invErr) return { rows: [], error: invErr.message, status: 500 };

    const invByKey = new Map<string, Record<string, unknown>>();
    for (const inv of invRows ?? []) {
      const vid = String(inv.catalog_variant_id);
      const loc = String(inv.location_code ?? "default");
      invByKey.set(inventoryKey(vid, loc), inv as Record<string, unknown>);
    }

    const rows: AdminVariantInventoryRow[] = variants.map((v) => {
      const vid = String(v.id);
      const loc =
        typeof v.default_location_code === "string" && v.default_location_code.trim()
          ? v.default_location_code.trim()
          : "default";
      const inv = invByKey.get(inventoryKey(vid, loc));
      const onHand = inv ? Number(inv.quantity_on_hand ?? 0) : 0;
      const reserved = inv ? Number(inv.quantity_reserved ?? 0) : 0;
      const product = productById.get(String(v.catalog_product_id));
      const brand =
        product?.brand_id != null ? brandById.get(String(product.brand_id)) ?? "" : "";
      const cfg = fulfillmentConfigFromRow(v as Record<string, unknown>);
      return {
        catalog_variant_id: vid,
        catalog_product_id: String(v.catalog_product_id),
        variant_sku: String(v.variant_sku ?? ""),
        size_code: v.size_code != null ? String(v.size_code) : null,
        product_name: product?.name != null ? String(product.name) : "",
        brand,
        fulfillment_mode: cfg.fulfillmentMode,
        inventory_tracking: cfg.inventoryTracking,
        inventory_visibility: cfg.inventoryVisibility,
        stock_enforcement: cfg.stockEnforcement,
        location_code: loc,
        quantity_on_hand: onHand,
        quantity_reserved: reserved,
        available_stock: Math.max(0, onHand - reserved),
        incoming_quantity: inv ? Number(inv.incoming_quantity ?? 0) : 0,
        reorder_point: inv ? Number(inv.reorder_point ?? 0) : cfg.reorderPoint,
        bin_location: inv ? String(inv.bin_location ?? "") : "",
        last_count_at: inv?.last_count_at != null ? String(inv.last_count_at) : null,
      };
    });

    return { rows, error: null, status: 200 };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load warehouse inventory";
    return { rows: [], error: message, status: 500 };
  }
}

export async function fetchAdminDropshipCatalog(
  supabase: SupabaseClient,
): Promise<{ rows: AdminDropshipCatalogRow[]; error: string | null; status: number }> {
  try {
    const { data: variants, error: vErr } = await supabase
      .schema(V2)
      .from("catalog_variants")
      .select("id, catalog_product_id, variant_sku, size_code, fulfillment_mode")
      .eq("is_active", true)
      .eq("fulfillment_mode", "dropship")
      .order("variant_sku", { ascending: true })
      .limit(5000);
    if (vErr) return { rows: [], error: vErr.message, status: 500 };

    const productIds = [...new Set((variants ?? []).map((v) => String(v.catalog_product_id)))];
    const { data: products } = await supabase
      .schema(V2)
      .from("catalog_products")
      .select("id, name, brand_id")
      .in("id", productIds.length ? productIds : ["00000000-0000-4000-8000-000000000000"]);
    const productById = new Map(
      (products ?? []).map((p) => [String(p.id), p as Record<string, unknown>]),
    );
    const brandById = await loadBrandNamesByIds(
      supabase,
      (products ?? []).map((p) => (p.brand_id != null ? String(p.brand_id) : "")).filter(Boolean),
    );

    const rows: AdminDropshipCatalogRow[] = (variants ?? []).map((v) => {
      const product = productById.get(String(v.catalog_product_id));
      const brand =
        product?.brand_id != null ? brandById.get(String(product.brand_id)) ?? "" : "";
      return {
        catalog_variant_id: String(v.id),
        variant_sku: String(v.variant_sku ?? ""),
        size_code: v.size_code != null ? String(v.size_code) : null,
        product_name: product?.name != null ? String(product.name) : "",
        brand,
        fulfillment_mode: "dropship",
      };
    });
    return { rows, error: null, status: 200 };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load dropship catalog";
    return { rows: [], error: message, status: 500 };
  }
}

export async function fetchAdminIncomingPurchaseOrders(
  supabase: SupabaseClient,
): Promise<{ rows: AdminIncomingPoRow[]; error: string | null; status: number }> {
  try {
    const { data: pos, error: poErr } = await supabase
      .from("purchase_orders")
      .select("id, po_number, manufacturer_id, status, created_at, lines, received_lines, purchase_order_type")
      .eq("purchase_order_type", "inbound_stock")
      .in("status", ["sent", "partially_received", "draft"])
      .order("created_at", { ascending: false })
      .limit(200);
    if (poErr) return { rows: [], error: poErr.message, status: 500 };

    const mfrIds = [...new Set((pos ?? []).map((p) => Number(p.manufacturer_id)))];
    const { data: mfrs } = await supabase.from("manufacturers").select("id, name").in("id", mfrIds);
    const mfrById = new Map((mfrs ?? []).map((m) => [Number(m.id), String(m.name ?? "")]));

    const rows: AdminIncomingPoRow[] = (pos ?? [])
      .filter((po) => po.status !== "received" && po.status !== "cancelled")
      .map((po) => {
        const lines = Array.isArray(po.lines) ? po.lines : [];
        const received = Array.isArray(po.received_lines) ? po.received_lines : [];
        const orderedTotal = lines.reduce(
          (sum, l) => sum + Math.max(0, Number((l as { quantity?: number }).quantity ?? 0) || 0),
          0,
        );
        const receivedTotal = received.reduce(
          (sum, r) =>
            sum + Math.max(0, Number((r as { quantity_received?: number }).quantity_received ?? 0) || 0),
          0,
        );
        return {
          id: Number(po.id),
          po_number: po.po_number != null ? String(po.po_number) : `#${po.id}`,
          manufacturer_name: mfrById.get(Number(po.manufacturer_id)) ?? "",
          status: String(po.status ?? "draft"),
          created_at: String(po.created_at ?? ""),
          line_count: lines.length,
          pending_lines: Math.max(0, orderedTotal - receivedTotal),
        };
      });
    return { rows, error: null, status: 200 };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load incoming POs";
    return { rows: [], error: message, status: 500 };
  }
}

export async function fetchAdminVariantStockHistory(
  supabase: SupabaseClient,
  limit = 200,
): Promise<{ rows: AdminVariantStockHistoryRow[]; error: string | null; status: number }> {
  try {
    const { data: history, error: hErr } = await supabase
      .schema(V2)
      .from("variant_stock_history")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (hErr) return { rows: [], error: hErr.message, status: 500 };

    const variantIds = [...new Set((history ?? []).map((h) => String(h.catalog_variant_id)))];
    const { data: variants } = await supabase
      .schema(V2)
      .from("catalog_variants")
      .select("id, variant_sku")
      .in("id", variantIds.length ? variantIds : ["00000000-0000-4000-8000-000000000000"]);
    const skuById = new Map((variants ?? []).map((v) => [String(v.id), String(v.variant_sku ?? "")]));

    const rows: AdminVariantStockHistoryRow[] = (history ?? []).map((h) => ({
      id: Number(h.id),
      catalog_variant_id: String(h.catalog_variant_id),
      variant_sku: skuById.get(String(h.catalog_variant_id)) ?? "",
      delta: Number(h.delta ?? 0),
      type: String(h.type ?? ""),
      reference_type: h.reference_type != null ? String(h.reference_type) : null,
      reference_id: h.reference_id != null ? Number(h.reference_id) : null,
      notes: h.notes != null ? String(h.notes) : null,
      balance_after: h.balance_after != null ? Number(h.balance_after) : null,
      created_at: String(h.created_at ?? ""),
      operator_user_id: h.user_id != null ? String(h.user_id) : null,
    }));
    return { rows, error: null, status: 200 };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load stock history";
    return { rows: [], error: message, status: 500 };
  }
}

type RpcAdjustResult = {
  ok?: boolean;
  code?: string;
  error?: string;
  quantity_on_hand?: number;
  quantity_reserved?: number;
};

export async function adjustAdminVariantInventory(
  supabase: SupabaseClient,
  operatorId: string,
  input: AdminVariantAdjustInput,
): Promise<{
  success: boolean;
  stock: { quantity_on_hand: number; quantity_reserved: number; available_stock: number } | null;
  error: string | null;
  code: string | null;
  status: number;
}> {
  const variantId = normalizeCanonicalUuidInput(input.catalog_variant_id);
  if (!variantId) {
    return {
      success: false,
      stock: null,
      error: "catalog_variant_id must be a UUID",
      code: VARIANT_REQUIRED,
      status: 400,
    };
  }
  const d = Number(input.delta);
  if (!Number.isFinite(d) || d === 0) {
    return {
      success: false,
      stock: null,
      error: "delta must be a non-zero integer",
      code: null,
      status: 400,
    };
  }
  const reason = input.reason?.trim();
  if (!reason) {
    return {
      success: false,
      stock: null,
      error: "reason is required for manual adjustments",
      code: null,
      status: 400,
    };
  }

  const { data, error: rpcErr } = await supabase.rpc("admin_adjust_variant_inventory_atomic", {
    p_catalog_variant_id: variantId,
    p_operator_user_id: operatorId,
    p_delta: d,
    p_reason: reason,
    p_location_code: input.location_code?.trim() || "default",
  });
  if (rpcErr) {
    return { success: false, stock: null, error: rpcErr.message, code: null, status: 500 };
  }
  const result = (data ?? {}) as RpcAdjustResult;
  if (!result.ok) {
    const code = result.code ?? null;
    const status = code === RESERVED_EXCEEDS_ON_HAND ? 409 : 400;
    return {
      success: false,
      stock: null,
      error: result.error ?? "Failed to adjust inventory",
      code,
      status,
    };
  }
  const onHand = Number(result.quantity_on_hand ?? 0);
  const reserved = Number(result.quantity_reserved ?? 0);
  return {
    success: true,
    stock: {
      quantity_on_hand: onHand,
      quantity_reserved: reserved,
      available_stock: Math.max(0, onHand - reserved),
    },
    error: null,
    code: null,
    status: 200,
  };
}

/** Product-level rollup from variant warehouse inventory (native source of truth). */
export async function fetchAdminInventory(
  supabase: SupabaseClient,
): Promise<{ rows: AdminInventoryRow[]; error: string | null; status: number }> {
  const { rows: variants, error, status } = await fetchAdminWarehouseInventory(supabase);
  if (error) return { rows: [], error, status };
  if (variants.length === 0) return { rows: [], error: null, status: 200 };

  type Agg = {
    product_id: string;
    sku: string;
    name: string;
    brand: string;
    quantity_on_hand: number;
    quantity_reserved: number;
    reorder_point: number;
    bin_location: string;
    last_count_at: string | null;
  };

  const byProduct = new Map<string, Agg>();
  for (const v of variants) {
    const pid = v.catalog_product_id;
    const agg = byProduct.get(pid) ?? {
      product_id: pid,
      sku: v.variant_sku,
      name: v.product_name,
      brand: v.brand,
      quantity_on_hand: 0,
      quantity_reserved: 0,
      reorder_point: v.reorder_point,
      bin_location: v.bin_location,
      last_count_at: v.last_count_at,
    };
    agg.quantity_on_hand += v.quantity_on_hand;
    agg.quantity_reserved += v.quantity_reserved;
    if (v.reorder_point > agg.reorder_point) agg.reorder_point = v.reorder_point;
    if (v.bin_location && !agg.bin_location) agg.bin_location = v.bin_location;
    if (v.last_count_at && (!agg.last_count_at || v.last_count_at > agg.last_count_at)) {
      agg.last_count_at = v.last_count_at;
    }
    byProduct.set(pid, agg);
  }

  const rows: AdminInventoryRow[] = [...byProduct.values()]
    .sort((a, b) => a.sku.localeCompare(b.sku))
    .map((agg) => ({
      product_id: agg.product_id,
      canonical_product_id: normalizeCanonicalUuidInput(agg.product_id),
      sku: agg.sku,
      name: agg.name,
      brand: agg.brand,
      quantity_on_hand: agg.quantity_on_hand,
      quantity_reserved: agg.quantity_reserved,
      available_stock: Math.max(0, agg.quantity_on_hand - agg.quantity_reserved),
      reorder_point: agg.reorder_point,
      bin_location: agg.bin_location,
      last_count_at: agg.last_count_at,
    }));

  return { rows, error: null, status: 200 };
}
