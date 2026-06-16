import type { AdminOperator } from "@/lib/admin/express-admin-bridge";
import { expressAdminFetch } from "@/lib/admin/express-admin-bridge";

export type ExpressInventoryRow = {
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

export async function fetchAdminInventoryFromExpress(
  operator: AdminOperator,
): Promise<{ rows: ExpressInventoryRow[]; error: string | null; status: number }> {
  const result = await expressAdminFetch(operator, "/api/admin/inventory", { method: "GET" });
  if (!result.ok) {
    return { rows: [], error: result.error, status: result.status };
  }
  const data = result.data;
  if (!Array.isArray(data)) {
    return { rows: [], error: "Unexpected inventory response", status: 502 };
  }
  return { rows: data as ExpressInventoryRow[], error: null, status: 200 };
}
