import type { AdminOperator } from "@/lib/admin/express-admin-bridge";
import { expressAdminFetch } from "@/lib/admin/express-admin-bridge";

export type ExpressPurchaseOrderRow = {
  id: number;
  po_number: string;
  manufacturer_id: number;
  manufacturer_name: string;
  order_id: number | string | null;
  order_number: string | null;
  status: string;
  subtotal?: number | null;
  created_at: string;
  sent_at?: string | null;
  lines?: {
    product_id?: string;
    canonical_product_id?: string;
    sku?: string;
    name?: string;
    quantity?: number;
    unit_cost?: number;
  }[];
};

export async function fetchAdminPurchaseOrdersFromExpress(
  operator: AdminOperator,
): Promise<{ rows: ExpressPurchaseOrderRow[]; error: string | null; status: number }> {
  const result = await expressAdminFetch(operator, "/api/admin/purchase-orders", { method: "GET" });
  if (!result.ok) {
    return { rows: [], error: result.error, status: result.status };
  }
  const data = result.data;
  if (!Array.isArray(data)) {
    return { rows: [], error: "Unexpected purchase orders response", status: 502 };
  }
  return { rows: data as ExpressPurchaseOrderRow[], error: null, status: 200 };
}

export async function fetchAdminPurchaseOrderDetailFromExpress(
  operator: AdminOperator,
  poId: number,
): Promise<{ po: ExpressPurchaseOrderRow | null; error: string | null; status: number }> {
  const result = await expressAdminFetch(operator, `/api/admin/purchase-orders/${poId}`, { method: "GET" });
  if (!result.ok) {
    return { po: null, error: result.error, status: result.status };
  }
  if (!result.data || typeof result.data !== "object") {
    return { po: null, error: "Unexpected PO detail response", status: 502 };
  }
  return { po: result.data as ExpressPurchaseOrderRow, error: null, status: 200 };
}
