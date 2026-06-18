import Link from "next/link";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { describeLifecycleStageForOperator } from "@/lib/procurement/operator-lifecycle-copy";
import { EmptyState, ErrorState, PageHeader, StatusBadge, TypeBadge } from "@/components/admin";
import { adminCardSurface, adminLink, adminStatusBadgeClasses } from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type OpportunityRow = {
  id: string;
  operational_environment_key: string | null;
  lifecycle_stage: string;
  source: string;
  company_name: string | null;
  contact_email: string | null;
  created_at: string;
  sales_prospect_id: number | null;
  quote_request_id: string | null;
};

type EventRow = {
  id: string;
  opportunity_id: string;
  event_type: string;
  schema_version: number;
  created_at: string;
  payload: Record<string, unknown> | null;
};

export default async function AdminOpportunitiesPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div>
        <PageHeader title="Sourcing threads" description="Procurement opportunity threads." />
        <ErrorState
          title="Database not configured"
          message="Sourcing threads cannot be loaded in this environment. Review Admin Health for configuration status."
        />
      </div>
    );
  }

  const supabase = getSupabaseAdmin() as any;
  const { data, error } = await supabase
    .from("procurement_opportunities")
    .select(
      "id, operational_environment_key, lifecycle_stage, source, company_name, contact_email, created_at, sales_prospect_id, quote_request_id",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = (data ?? []) as OpportunityRow[];

  const eventsByOpp = new Map<string, EventRow[]>();
  if (rows.length > 0) {
    const ids = rows.map((r) => r.id);
    const { data: ev } = await supabase
      .from("procurement_events")
      .select("id, opportunity_id, event_type, schema_version, created_at, payload")
      .in("opportunity_id", ids)
      .order("created_at", { ascending: true })
      .limit(500);
    for (const e of (ev ?? []) as EventRow[]) {
      const oid = e.opportunity_id;
      const arr = eventsByOpp.get(oid) ?? [];
      arr.push(e);
      eventsByOpp.set(oid, arr);
    }
  }

  return (
    <div>
      <PageHeader
        title="Sourcing threads"
        description="Procurement opportunity threads — operator stage, buyer-visible label, and linked quote requests (newest 50)."
      />

      {error ? (
        <ErrorState
          title="Could not load sourcing threads"
          message={String((error as { message?: string }).message)}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No sourcing threads yet"
          description="Threads appear when spend signals or quote requests are linked to procurement work."
        />
      ) : (
        <div className="space-y-4">
          {rows.map((r) => {
            const stageCopy = describeLifecycleStageForOperator(r.lifecycle_stage);
            return (
              <article key={r.id} className={adminCardSurface + " p-4"}>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Link href={`/admin/procurement/opportunity/${encodeURIComponent(r.id)}`} className={`font-mono text-xs ${adminLink}`}>
                    {r.id.slice(0, 8)}…
                  </Link>
                  <TypeBadge type={r.source} />
                  <StatusBadge status={r.lifecycle_stage} />
                  <span className="rounded-md bg-admin-surface-muted px-2 py-0.5 text-xs text-admin-secondary">
                    Buyer sees: {stageCopy.buyerSees}
                  </span>
                  {r.operational_environment_key ? (
                    <span className={cn("inline-flex rounded-md px-1.5 py-0.5 text-xs font-medium", adminStatusBadgeClasses("accent"))}>
                      {r.operational_environment_key}
                    </span>
                  ) : null}
                  <span className="ml-auto text-xs text-admin-muted">{new Date(r.created_at).toLocaleString()}</span>
                </div>
                <p className="mt-2 text-sm text-admin-primary">
                  <span className="text-admin-muted">Company:</span> {r.company_name ?? "—"}{" "}
                  <span className="ml-2 text-admin-muted">Email:</span> {r.contact_email ?? "—"}
                </p>
                <p className="mt-1 text-xs text-admin-secondary">{stageCopy.nextHint}</p>
                <p className="mt-2 text-xs text-admin-muted">
                  {r.quote_request_id ? (
                    <>
                      Linked quote request:{" "}
                      <span className="font-mono text-admin-secondary">{r.quote_request_id}</span>
                      {" · "}
                      <Link href="/admin/leads" className={adminLink}>
                        Open quote queue
                      </Link>
                    </>
                  ) : (
                    "No linked quote request"
                  )}
                  {r.sales_prospect_id != null ? (
                    <span className="ml-2 text-admin-muted"> · CRM prospect {r.sales_prospect_id}</span>
                  ) : null}
                </p>
                <div className="mt-3 border-t border-admin-border-subtle pt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-admin-muted">Recent activity</p>
                  <ul className="mt-2 space-y-1 text-xs text-admin-secondary">
                    {(eventsByOpp.get(r.id) ?? []).slice(-5).map((ev) => (
                      <li key={ev.id}>
                        {new Date(ev.created_at).toLocaleString()} — {ev.event_type}
                      </li>
                    ))}
                    {(eventsByOpp.get(r.id) ?? []).length === 0 ? (
                      <li className="text-admin-muted">No events yet</li>
                    ) : null}
                  </ul>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
