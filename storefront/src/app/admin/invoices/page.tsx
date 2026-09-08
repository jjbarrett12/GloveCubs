import { EmptyState, ErrorState, PageHeader } from "@/components/admin";
import { getAdminOperator } from "@/lib/admin/get-admin-user";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { InvoicesTable, type InvoiceIntakeRow } from "./InvoicesTable";

export const dynamic = "force-dynamic";

export default async function AdminInvoicesPage() {
  const operator = await getAdminOperator();
  if (!operator) {
    return (
      <div>
        <PageHeader title="Invoice intakes" description="Sign in as an admin operator." />
      </div>
    );
  }

  if (!isSupabaseConfigured()) {
    return (
      <div>
        <PageHeader title="Invoice intakes" description="Uploaded invoices awaiting operator review." />
        <ErrorState
          title="Database not configured"
          message="Invoice intakes cannot be loaded in this environment. Review Admin Health for configuration status."
        />
      </div>
    );
  }

  const supabase = getSupabaseAdmin() as any;
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("uploaded_invoices")
    .select(
      "id, original_filename, company_id, intake_status, staff_ops_status, created_at, aggregate_review_status, extraction_error, payload",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = (data ?? []) as InvoiceIntakeRow[];

  return (
    <div>
      <PageHeader
        title="Invoice intakes"
        description="Uploaded invoice documents — newest 100. Failed extractions are highlighted."
      />

      {error ? (
        <ErrorState title="Could not load invoice intakes" message={error.message} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No invoice intakes yet"
          description="Invoices appear here when buyers upload through invoice savings or workspace."
        />
      ) : (
        <InvoicesTable rows={rows} />
      )}
    </div>
  );
}
