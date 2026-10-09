import type { SupabaseClient } from "@supabase/supabase-js";
import type { FulfillmentMode, InventoryVisibility } from "@/lib/fulfillment/variant-fulfillment-config";
import { normalizeCanonicalUuidInput } from "@/lib/admin/admin-inventory";

const V2 = "catalog_v2";

export type VariantFulfillmentInput = {
  catalog_variant_id: string;
  fulfillment_mode: FulfillmentMode;
  inventory_visibility: InventoryVisibility;
  stock_enforcement: boolean;
  reorder_point?: number;
  default_bin_location?: string | null;
  default_location_code?: string;
};

export async function updateVariantFulfillment(
  supabase: SupabaseClient,
  operatorId: string,
  input: VariantFulfillmentInput,
): Promise<{ success: boolean; error: string | null; code: string | null; status: number }> {
  const variantId = normalizeCanonicalUuidInput(input.catalog_variant_id);
  if (!variantId) {
    return { success: false, error: "catalog_variant_id required", code: "VARIANT_REQUIRED", status: 400 };
  }

  const { data, error } = await supabase.rpc("admin_update_variant_fulfillment_atomic", {
    p_catalog_variant_id: variantId,
    p_operator_user_id: operatorId,
    p_fulfillment_mode: input.fulfillment_mode,
    p_inventory_visibility: input.inventory_visibility,
    p_stock_enforcement: input.stock_enforcement,
    p_reorder_point: input.fulfillment_mode === "stocked" ? Math.max(0, Number(input.reorder_point ?? 0) || 0) : 0,
    p_default_bin_location: input.fulfillment_mode === "stocked" ? input.default_bin_location ?? null : null,
    p_default_location_code:
      input.fulfillment_mode === "stocked" ? input.default_location_code?.trim() || "default" : "default",
  });
  if (error) return { success: false, error: error.message, code: null, status: 500 };

  const result = (data ?? {}) as { ok?: boolean; code?: string; error?: string };
  if (!result.ok) {
    return { success: false, error: result.error ?? "Update failed", code: result.code ?? null, status: 400 };
  }
  return { success: true, error: null, code: null, status: 200 };
}

export async function resolveSingleStockedVariantForProduct(
  supabase: SupabaseClient,
  catalogProductId: string,
): Promise<{ variantId: string | null; error: string | null; code: string | null }> {
  const { data, error } = await supabase
    .schema(V2)
    .from("catalog_variants")
    .select("id, fulfillment_mode")
    .eq("catalog_product_id", catalogProductId)
    .eq("is_active", true)
    .eq("fulfillment_mode", "stocked");
  if (error) return { variantId: null, error: error.message, code: null };
  const rows = data ?? [];
  if (rows.length === 1) return { variantId: String(rows[0]!.id), error: null, code: null };
  if (rows.length === 0) {
    return {
      variantId: null,
      error: "No stocked variant for product; assign fulfillment in product editor",
      code: "VARIANT_SELECTION_REQUIRED",
    };
  }
  return {
    variantId: null,
    error: "Multiple stocked variants; select exact SKU for adjustment",
    code: "VARIANT_SELECTION_REQUIRED",
  };
}
