import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { fetchProcurementEventTimeline, fetchProcurementOpportunitySummary } from "@/lib/procurement/procurement-workspace-read-models";
import { describeLifecycleStageForOperator } from "@/lib/procurement/operator-lifecycle-copy";
import { EmptyState, ErrorState, PageHeader, PageSection, PremiumSectionCard, StatCard, StatGrid } from "@/components/admin";
import { adminLink } from "@/components/admin/admin-theme-utils";
import { ProcurementEventsTable } from "@/app/admin/procurement/_ProcurementDetailUi";

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
        <ErrorState
          title="Database not configured"
          message="Sourcing thread details cannot be loaded in this environment. Review Admin Health for configuration status."
        />
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
        <PremiumSectionCard>
          <p className="text-sm text-admin-secondary">{stageCopy.nextHint}</p>
          <dl className="mt-4 grid max-w-xl gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-admin-muted">Linked quote request</dt>
              <dd className="mt-0.5 font-mono text-admin-primary">
                {header.quote_request_id ? (
                  <>
                    {header.quote_request_id}
                    <span className="mt-1 block">
                      <Link href="/admin/leads" className={adminLink}>
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
              <dt className="text-xs font-medium uppercase tracking-wide text-admin-muted">CRM prospect</dt>
              <dd className="mt-0.5 font-mono text-admin-primary">
                {header.sales_prospect_id != null ? String(header.sales_prospect_id) : "—"}
              </dd>
            </div>
          </dl>
        </PremiumSectionCard>
      </PageSection>

      <PageSection title="Procurement activity">
        {eventList.length === 0 ? (
          <EmptyState title="No activity" description="No procurement events recorded for this sourcing thread." />
        ) : (
          <ProcurementEventsTable events={eventList} />
        )}
      </PageSection>

      <p className="mt-6 text-sm text-admin-secondary">
        <Link href="/admin/opportunities" className={adminLink}>
          ← Sourcing threads
        </Link>
      </p>
    </div>
  );
}
