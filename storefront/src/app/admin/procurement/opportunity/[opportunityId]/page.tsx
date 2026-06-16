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
          title="Sourcing thread"
          breadcrumb={[
            { label: "Sourcing threads", href: "/admin/opportunities" },
            { label: "Thread" },
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
        title={header.company_name ?? "Sourcing thread"}
        description={`Thread ${header.id} — operator procurement review`}
        breadcrumb={[
          { label: "Procurement review", href: "/admin/procurement" },
          { label: "Sourcing threads", href: "/admin/opportunities" },
          { label: header.company_name ?? "Thread" },
        ]}
      />

      <StatGrid columns={3} className="mb-6">
        <StatCard label="Operator stage" value={stageCopy.label} color="purple" accentBorder />
        <StatCard label="Buyer sees" value={stageCopy.buyerSees} color="blue" accentBorder />
        <StatCard label="Workflow" value={stageCopy.domain.replace(/_/g, " ")} color="default" accentBorder />
      </StatGrid>

      <PageSection title="Stage guidance">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-700">{stageCopy.nextHint}</p>
          <dl className="mt-4 grid max-w-xl gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Linked quote request</dt>
              <dd className="mt-0.5 font-mono text-gray-900">
                {header.quote_request_id ? (
                  <>
                    {header.quote_request_id}
                    <span className="mt-1 block">
                      <Link href="/admin/leads" className="text-sm font-medium text-blue-700 hover:underline">
                        Open quote request queue →
                      </Link>
                    </span>
                  </>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">CRM prospect</dt>
              <dd className="mt-0.5 font-mono text-gray-900">
                {header.sales_prospect_id != null ? String(header.sales_prospect_id) : "—"}
              </dd>
            </div>
          </dl>
        </div>
      </PageSection>

      <PageSection title="Procurement activity">
        <TableCard>
          {eventList.length === 0 ? (
            <EmptyState title="No activity" description="No procurement events recorded for this sourcing thread." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="p-3">Time</th>
                    <th className="p-3">Event</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {eventList.map((e) => (
                    <tr key={String(e.id)} className="align-top hover:bg-blue-50/40">
                      <td className="whitespace-nowrap p-3 text-xs text-gray-600">{String(e.created_at ?? "")}</td>
                      <td className="p-3 text-xs text-gray-900">{String(e.event_type ?? "")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TableCard>
      </PageSection>

      <p className="mt-6 text-sm text-gray-600">
        <Link href="/admin/opportunities" className="font-medium text-blue-700 hover:underline">
          ← Sourcing threads
        </Link>
      </p>
    </div>
  );
}
