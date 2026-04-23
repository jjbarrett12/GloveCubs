import type { OrderItemRow } from "@/lib/supabase/types";
import type { LegacyOrderItemApi } from "./legacy-express-api";

/** Map a strict `order_items` row + display fields to the legacy Express order API line shape. */
export function mapOrderItemRowToLegacyApi(
  row: Pick<OrderItemRow, "product_id" | "quantity" | "size" | "unit_price" | "canonical_product_id">,
  display: { product_name: string; sku: string }
): LegacyOrderItemApi {
  return {
    product_id: row.product_id,
    quantity: row.quantity,
    size: row.size,
    unit_price: Number(row.unit_price),
    product_name: display.product_name,
    sku: display.sku,
    canonical_product_id: row.canonical_product_id ?? null,
  };
}
