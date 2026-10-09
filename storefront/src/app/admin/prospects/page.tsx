import { EmptyState, ErrorState, PageHeader } from "@/components/admin";
import { getAdminOperator } from "@/lib/admin/get-admin-user";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { ProspectsTable, type ProspectRow } from "./ProspectsTable";

export const dynamic = "force-dynamic";

export default async function AdminProspectsPage() {
  const operator = await getAdminOperator();
  if (!operator) {
    return (
      <div>
        <PageHeader title="Pricing leads" description="Sign in as an admin operator." />
      </div>
    );
  }

  if (!isSupabaseConfigured()) {
    return (
      <div>
        <PageHeader title="Pricing leads" description="Inbound request-pricing submissions for operator review." />
        <ErrorState
          title="Database not configured"
          message="Pricing leads cannot be loaded in this environment. Review Admin Health for configuration status."
        />
      </div>
    );
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("sales_prospects")
    .select(
      "id, company_name, contact_name, email, phone, source, status, notes, created_at, updated_at, last_contacted_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = (data ?? []) as ProspectRow[];

  return (
    <div>
      <PageHeader
        title="Pricing leads"
        description="Request-pricing submissions from the storefront — newest 100."
      />

      {error ? (
        <ErrorState title="Could not load pricing leads" message={error.message} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No pricing leads yet"
          description="Leads appear here when buyers submit the request-pricing form."
        />
      ) : (
        <ProspectsTable rows={rows} />
      )}
    </div>
  );
}
