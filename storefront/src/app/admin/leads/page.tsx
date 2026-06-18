import Link from "next/link";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { EmptyState, ErrorState, PageHeader } from "@/components/admin";
import { LeadsTable, type LeadQuoteRow } from "./LeadsTable";

export const dynamic = "force-dynamic";

export default async function AdminLeadsPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div>
        <PageHeader title="Quote requests" description="Inbound quote requests for operator review." />
        <ErrorState
          title="Database not configured"
          message="Quote requests cannot be loaded in this environment. Review Admin Health for configuration status."
        />
      </div>
    );
  }

  const supabase = getSupabaseAdmin() as any;
  const { data, error } = (await supabase
    .schema("catalogos")
    .from("quote_requests")
    .select(
      "id, status, contact_name, email, company_name, phone, created_at, gc_company_id, ship_to_address_id, ship_to_label, ship_to_snapshot",
    )
    .order("created_at", { ascending: false })
    .limit(100)) as { data: LeadQuoteRow[] | null; error: { message: string } | null };

  const rows = data ?? [];

  return (
    <div>
      <PageHeader
        title="Quote requests"
        description="Inbound quote requests for operator review — buyer-visible status shown for continuity (newest 100)."
      />

      {error ? (
        <ErrorState title="Could not load quote requests" message={error.message} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No quote requests yet"
          description="Quote requests appear here when buyers submit from the storefront quote cart."
        />
      ) : (
        <LeadsTable rows={rows} />
      )}
    </div>
  );
}
