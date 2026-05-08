import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { describeLifecycleStageForOperator } from "@/lib/procurement/operator-lifecycle-copy";

export const dynamic = "force-dynamic";

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

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

export default async function AdminOpportunitiesPage({
  searchParams,
}: {
  searchParams: { secret?: string };
}) {
  const gate = process.env.ADMIN_LEADS_SECRET?.trim();
  const prod = isProduction();

  if (prod) {
    if (!gate) {
      notFound();
    }
    if (searchParams.secret !== gate) {
      notFound();
    }
  } else if (gate && searchParams.secret !== gate) {
    return (
      <div className="min-h-screen bg-[hsl(var(--background))] p-10 text-white">
        <p className="text-white/70">
          Unauthorized. Pass <code className="text-white">?secret=…</code> matching ADMIN_LEADS_SECRET.
        </p>
      </div>
    );
  }

  if (!isSupabaseConfigured()) {
    return (
      <div className="min-h-screen bg-[hsl(var(--background))] p-10 text-white">
        <p>Supabase not configured.</p>
      </div>
    );
  }

  const supabase = getSupabaseAdmin() as any;
  const { data, error } = await supabase
    .from("procurement_opportunities")
    .select(
      "id, operational_environment_key, lifecycle_stage, source, company_name, contact_email, created_at, sales_prospect_id, quote_request_id"
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
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <Link href="/" className="font-semibold text-white">
          GloveCubs
        </Link>
        <span className="text-sm text-white/50">Procurement opportunities</span>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="mb-6 text-2xl font-bold text-white">Operational opportunities (Phase 2B)</h1>
        {error && <p className="mb-4 text-sm text-amber-200">{String((error as { message?: string }).message)}</p>}
        <div className="space-y-8">
          {rows.map((r) => (
            <article key={r.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap gap-2 text-sm text-white/80">
                <span className="font-mono text-xs text-white/50">{r.id}</span>
                <span className="rounded bg-white/10 px-2 py-0.5 text-xs">{r.source}</span>
                {r.operational_environment_key ? (
                  <span className="rounded bg-[#f06232]/20 px-2 py-0.5 text-xs text-[#f06232]">
                    {r.operational_environment_key}
                  </span>
                ) : null}
                <span className="text-white/50">{new Date(r.created_at).toLocaleString()}</span>
              </div>
              <p className="mt-2 text-white">
                <span className="text-white/50">Company:</span> {r.company_name ?? "—"}{" "}
                <span className="text-white/50">Email:</span> {r.contact_email ?? "—"}
              </p>
              <p className="mt-1 text-xs text-white/50">
                Stage: {r.lifecycle_stage} ({describeLifecycleStageForOperator(r.lifecycle_stage).label})
                {r.sales_prospect_id != null ? ` · sales_prospect_id: ${r.sales_prospect_id}` : ""}
                {r.quote_request_id != null ? ` · quote_request_id: ${r.quote_request_id}` : ""}
              </p>
              <div className="mt-3 border-t border-white/10 pt-3">
                <p className="text-xs font-bold uppercase tracking-wide text-white/45">Events</p>
                <ul className="mt-2 space-y-1 text-xs text-white/70">
                  {(eventsByOpp.get(r.id) ?? []).map((ev) => (
                    <li key={ev.id} className="font-mono">
                      {new Date(ev.created_at).toLocaleString()} — {ev.event_type} (v{ev.schema_version})
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
        {rows.length === 0 && !error && (
          <p className="mt-4 text-sm text-white/50">No procurement opportunities yet (or table not migrated).</p>
        )}
      </main>
    </div>
  );
}
