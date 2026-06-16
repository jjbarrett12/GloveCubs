import type { AdminOperator } from "@/lib/admin/express-admin-bridge";
import { expressAdminFetch } from "@/lib/admin/express-admin-bridge";

export type ExpressNetTermsApplication = {
  id: string;
  company_id: string;
  company_name: string | null;
  company_net_terms_status?: string | null;
  applicant_email: string | null;
  applicant_user_id?: string;
  status: string;
  business_name?: string | null;
  contact_name?: string | null;
  email?: string | null;
  created_at: string;
  decision_notes?: string | null;
};

export async function fetchAdminNetTermsApplicationsFromExpress(
  operator: AdminOperator,
  status?: string,
): Promise<{ applications: ExpressNetTermsApplication[]; error: string | null; status: number }> {
  const qs = status?.trim() ? `?status=${encodeURIComponent(status.trim())}` : "";
  const result = await expressAdminFetch(operator, `/api/admin/net-terms/applications${qs}`, { method: "GET" });
  if (!result.ok) {
    return { applications: [], error: result.error, status: result.status };
  }
  const data = result.data as { applications?: ExpressNetTermsApplication[] };
  if (!data || !Array.isArray(data.applications)) {
    return { applications: [], error: "Unexpected net terms response", status: 502 };
  }
  return { applications: data.applications, error: null, status: 200 };
}
