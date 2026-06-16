import Link from "next/link";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { describeLifecycleStageForOperator } from "@/lib/procurement/operator-lifecycle-copy";
import { PageHeader, EmptyState } from "@/components/admin";

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
        <PageHeader title="Sourcing threads" description="Supabase not configured." />
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to load sourcing threads.
        </div>
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
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          {String((error as { message?: string }).message)}
        </div>
      ) : null}

      {rows.length === 0 && !error ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white">
          <EmptyState
            title="No sourcing threads yet"
            description="Threads appear when spend signals or quote requests are linked to procurement work."
          />
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((r) => {
            const stageCopy = describeLifecycleStageForOperator(r.lifecycle_stage);
            return (
              <article key={r.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Link
                    href={`/admin/procurement/opportunity/${encodeURIComponent(r.id)}`}
                    className="font-mono text-xs text-blue-700 hover:underline"
                  >
                    {r.id.slice(0, 8)}…
                  </Link>
                  <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium capitalize text-blue-700">
                    {r.source}
                  </span>
                  <span className="rounded-md border border-purple-200 bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-800">
                    {stageCopy.label}
                  </span>
                  <span className="rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-600">
                    Buyer sees: {stageCopy.buyerSees}
                  </span>
                  {r.operational_environment_key ? (
                    <span className="rounded-md border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700">
                      {r.operational_environment_key}
                    </span>
                  ) : null}
                  <span className="ml-auto text-xs text-gray-500">{new Date(r.created_at).toLocaleString()}</span>
                </div>
                <p className="mt-2 text-sm text-gray-900">
                  <span className="text-gray-500">Company:</span> {r.company_name ?? "—"}{" "}
                  <span className="ml-2 text-gray-500">Email:</span> {r.contact_email ?? "—"}
                </p>
                <p className="mt-1 text-xs text-gray-600">{stageCopy.nextHint}</p>
                <p className="mt-2 text-xs text-gray-500">
                  {r.quote_request_id ? (
                    <>
                      Linked quote request:{" "}
                      <span className="font-mono text-gray-700">{r.quote_request_id}</span>
                      {" · "}
                      <Link href="/admin/leads" className="font-medium text-blue-700 hover:underline">
                        Open quote queue
                      </Link>
                    </>
                  ) : (
                    "No linked quote request"
                  )}
                  {r.sales_prospect_id != null ? (
                    <span className="ml-2 text-gray-400"> · CRM prospect {r.sales_prospect_id}</span>
                  ) : null}
                </p>
                <div className="mt-3 border-t border-gray-100 pt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Recent activity</p>
                  <ul className="mt-2 space-y-1 text-xs text-gray-600">
                    {(eventsByOpp.get(r.id) ?? []).slice(-5).map((ev) => (
                      <li key={ev.id}>
                        {new Date(ev.created_at).toLocaleString()} — {ev.event_type}
                      </li>
                    ))}
                    {(eventsByOpp.get(r.id) ?? []).length === 0 ? (
                      <li className="text-gray-400">No events yet</li>
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
