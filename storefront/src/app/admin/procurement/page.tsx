import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { fetchCompaniesWithRecommendations } from "@/lib/procurement/procurement-workspace-read-models";
import { EmptyState, ErrorState, PageHeader } from "@/components/admin";
import { ProcurementTable } from "./ProcurementTable";

export const dynamic = "force-dynamic";

export default async function ProcurementOverviewPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div>
        <PageHeader title="Procurement review" description="Companies with open procurement review queues." />
        <ErrorState
          title="Database not configured"
          message="Procurement signals cannot be loaded in this environment. Review Admin Health for configuration status."
        />
      </div>
    );
  }

  const supabase = getSupabaseAdmin() as any;
  const rows = await fetchCompaniesWithRecommendations(supabase, 50);

  return (
    <div>
      <PageHeader
        title="Procurement review"
        description="Companies with open procurement review queues — savings opportunities and blocked rows."
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No signals yet"
          description="No savings opportunities or blocked rows yet."
        />
      ) : (
        <ProcurementTable rows={rows} />
      )}
    </div>
  );
}
