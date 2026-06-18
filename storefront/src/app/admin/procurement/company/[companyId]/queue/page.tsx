import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { fetchApprovedRecommendations, fetchRecommendationReviewQueueEnriched } from "@/lib/procurement/procurement-workspace-read-models";
import { ReviewQueueRow } from "@/app/admin/procurement/ReviewQueueRow";
import { ApprovedReorderRow } from "@/app/admin/procurement/ApprovedReorderRow";
import { ProcurementTableShell } from "@/app/admin/procurement/_ProcurementTableShell";
import { ErrorState, PageHeader, PageSection, TableCard, EmptyState } from "@/components/admin";

export const dynamic = "force-dynamic";

const NOT_CONFIGURED = (
  <ErrorState
    title="Database not configured"
    message="Procurement review data cannot be loaded in this environment. Review Admin Health for configuration status."
  />
);

export default async function ProcurementQueuePage({ params }: { params: { companyId: string } }) {
  const { companyId } = params;
  if (!isSupabaseConfigured()) {
    return (
      <div>
        <PageHeader
          title="Review queue"
          breadcrumb={[
            { label: "Procurement", href: "/admin/procurement" },
            { label: "Company", href: `/admin/procurement/company/${companyId}` },
            { label: "Queue" },
          ]}
        />
        {NOT_CONFIGURED}
      </div>
    );
  }
  const supabase = getSupabaseAdmin() as any;
  const queue = await fetchRecommendationReviewQueueEnriched(supabase, companyId);
  const approved = await fetchApprovedRecommendations(supabase, companyId);

  return (
    <div>
      <PageHeader
        title="Review queue"
        breadcrumb={[
          { label: "Procurement", href: "/admin/procurement" },
          { label: "Company", href: `/admin/procurement/company/${companyId}` },
          { label: "Queue" },
        ]}
      />

      <PageSection title="Open items" description="Savings opportunities awaiting operator action.">
        <TableCard>
          {queue.length === 0 ? (
            <EmptyState title="No items in review queue" description="Nothing pending for this company." />
          ) : (
            <ProcurementTableShell
              minWidth="min-w-[720px]"
              headers={[
                { label: "Id" },
                { label: "Status" },
                { label: "Source product" },
                { label: "Candidate" },
                { label: "Δ / basis", align: "right" },
                { label: "Actions" },
              ]}
            >
              {queue.map((row) => (
                <ReviewQueueRow key={String(row.id)} row={row} companyId={companyId} />
              ))}
            </ProcurementTableShell>
          )}
        </TableCard>
      </PageSection>

      <PageSection
        title="Approved for customer workspace"
        description="Promotions require rows in this state (operator-governed; not automatic customer send)."
      >
        <TableCard>
          {approved.length === 0 ? (
            <EmptyState title="None approved yet" description="Approved rows appear here before reorder promotion." />
          ) : (
            <ProcurementTableShell
              minWidth="min-w-[560px]"
              headers={[
                { label: "Id" },
                { label: "Source product" },
                { label: "Δ / basis", align: "right" },
                { label: "Reorder" },
              ]}
            >
              {approved.map((row) => (
                <ApprovedReorderRow key={String(row.id)} row={row} companyId={companyId} />
              ))}
            </ProcurementTableShell>
          )}
        </TableCard>
      </PageSection>
    </div>
  );
}
