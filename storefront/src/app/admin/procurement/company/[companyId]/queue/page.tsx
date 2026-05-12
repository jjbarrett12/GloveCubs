import Link from "next/link";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { fetchApprovedRecommendations, fetchRecommendationReviewQueueEnriched } from "@/lib/procurement/procurement-workspace-read-models";
import { ReviewQueueRow } from "@/app/admin/procurement/ReviewQueueRow";
import { ApprovedReorderRow } from "@/app/admin/procurement/ApprovedReorderRow";
import { PageHeader, PageSection, TableCard, EmptyState } from "@/components/admin";

export const dynamic = "force-dynamic";

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
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Supabase not configured.
        </div>
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
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="p-3">Id</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Source product</th>
                    <th className="p-3">Candidate</th>
                    <th className="p-3 text-right">Δ / basis</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {queue.map((row) => (
                    <ReviewQueueRow key={String(row.id)} row={row} companyId={companyId} />
                  ))}
                </tbody>
              </table>
            </div>
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
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="p-3">Id</th>
                    <th className="p-3">Source product</th>
                    <th className="p-3 text-right">Δ / basis</th>
                    <th className="p-3">Reorder</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {approved.map((row) => (
                    <ApprovedReorderRow key={String(row.id)} row={row} companyId={companyId} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TableCard>
      </PageSection>
    </div>
  );
}
