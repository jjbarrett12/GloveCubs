import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { fetchProcurementEventTimeline, fetchProcurementOpportunitySummary } from "@/lib/procurement/procurement-workspace-read-models";
import { describeLifecycleStageForOperator } from "@/lib/procurement/operator-lifecycle-copy";
import { PageHeader, PageSection, StatCard, StatGrid, TableCard, EmptyState } from "@/components/admin";

export const dynamic = "force-dynamic";

export default async function ProcurementOpportunityWorkspacePage({ params }: { params: { opportunityId: string } }) {
  const { opportunityId } = params;
  if (!isSupabaseConfigured()) {
    return (
      <div>
        <PageHeader
          title="Opportunity workspace"
          breadcrumb={[
            { label: "Procurement", href: "/admin/procurement" },
            { label: "Opportunity" },
          ]}
        />
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Supabase not configured.
        </div>
      </div>
    );
  }
  const supabase = getSupabaseAdmin() as any;
  const header = await fetchProcurementOpportunitySummary(supabase, opportunityId);
  if (!header) notFound();
  const events = await fetchProcurementEventTimeline(supabase, opportunityId, 120);
  const stageCopy = describeLifecycleStageForOperator(header.lifecycle_stage);
  const eventList = events as Record<string, unknown>[];

  return (
    <div>
      <PageHeader
        title={header.company_name ?? "Opportunity"}
        description={header.id}
        breadcrumb={[
          { label: "Procurement", href: "/admin/procurement" },
          { label: header.company_name ?? "Opportunity" },
        ]}
      />

      <StatGrid columns={2} className="mb-6">
        <StatCard label="Lifecycle stage" value={header.lifecycle_stage} color="blue" accentBorder />
        <StatCard label="Operator label" value={stageCopy.label} color="purple" accentBorder />
      </StatGrid>

      <PageSection title="Stage guidance">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-700">{stageCopy.nextHint}</p>
          <dl className="mt-4 grid max-w-xl gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Quote request</dt>
              <dd className="mt-0.5 font-mono text-gray-900">{header.quote_request_id ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Sales prospect</dt>
              <dd className="mt-0.5 font-mono text-gray-900">
                {header.sales_prospect_id != null ? String(header.sales_prospect_id) : "—"}
              </dd>
            </div>
          </dl>
        </div>
      </PageSection>

      <PageSection title="Procurement event timeline">
        <TableCard>
          {eventList.length === 0 ? (
            <EmptyState title="No events" description="No procurement events recorded for this opportunity." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="p-3">Time</th>
                    <th className="p-3">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {eventList.map((e) => (
                    <tr key={String(e.id)} className="align-top hover:bg-blue-50/40">
                      <td className="whitespace-nowrap p-3 text-xs text-gray-600">{String(e.created_at ?? "")}</td>
                      <td className="p-3 font-mono text-xs text-gray-900">{String(e.event_type ?? "")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TableCard>
      </PageSection>

      <p className="mt-6 text-sm text-gray-600">
        <Link href="/admin/procurement" className="font-medium text-blue-700 hover:underline">
          ← Procurement overview
        </Link>
      </p>
    </div>
  );
}
