import type { AdminOperator } from "@/lib/admin/express-admin-bridge";
import { expressAdminFetch } from "@/lib/admin/express-admin-bridge";

export type ExpressAdminUserRow = {
  id: string;
  email: string;
  company_name?: string;
  contact_name?: string;
  is_approved?: number | boolean;
  discount_tier?: string;
  pricing_tier_source?: string;
  payment_terms?: string;
  phone?: string;
  created_at?: string;
};

export async function fetchAdminUsersFromExpress(
  operator: AdminOperator,
): Promise<{ rows: ExpressAdminUserRow[]; error: string | null; status: number }> {
  const result = await expressAdminFetch(operator, "/api/admin/users", { method: "GET" });
  if (!result.ok) {
    return { rows: [], error: result.error, status: result.status };
  }
  if (!Array.isArray(result.data)) {
    return { rows: [], error: "Unexpected users response", status: 502 };
  }
  return { rows: result.data as ExpressAdminUserRow[], error: null, status: 200 };
}
