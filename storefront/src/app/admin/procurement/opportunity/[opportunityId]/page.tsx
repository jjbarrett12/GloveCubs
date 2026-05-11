import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { fetchProcurementEventTimeline, fetchProcurementOpportunitySummary } from "@/lib/procurement/procurement-workspace-read-models";
import { describeLifecycleStageForOperator } from "@/lib/procurement/operator-lifecycle-copy";

export const dynamic = "force-dynamic";

export default async function ProcurementOpportunityWorkspacePage({ params }: { params: { opportunityId: string } }) {
  const { opportunityId } = params;
  if (!isSupabaseConfigured()) {
    return <p className="text-white/70">Supabase not configured.</p>;
  }
  const supabase = getSupabaseAdmin() as any;
  const header = await fetchProcurementOpportunitySummary(supabase, opportunityId);
  if (!header) notFound();
  const events = await fetchProcurementEventTimeline(supabase, opportunityId, 120);
  const stageCopy = describeLifecycleStageForOperator(header.lifecycle_stage);

  return (
    <div>
      <h2 className="text-base font-medium">Opportunity workspace</h2>
      <p className="font-mono text-xs text-white/60">{header.id}</p>
      <p className="text-sm text-white/80">{header.company_name ?? "—"}</p>
      <p className="mt-1 text-xs text-white/70">
        <span className="text-white/45">Stage (raw):</span> {header.lifecycle_stage}{" "}
        <span className="text-white/45">·</span> <span className="font-medium text-white/90">{stageCopy.label}</span>
      </p>
      <p className="mt-1 max-w-2xl text-xs text-amber-100/90">{stageCopy.nextHint}</p>
      <dl className="mt-2 grid max-w-xl gap-1 text-xs text-white/65">
        <div className="flex gap-2">
          <dt className="text-white/45">Quote request</dt>
          <dd className="font-mono">{header.quote_request_id ?? "—"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-white/45">Sales prospect</dt>
          <dd className="font-mono">{header.sales_prospect_id != null ? String(header.sales_prospect_id) : "—"}</dd>
        </div>
      </dl>
      <p className="mt-4 text-sm font-medium text-white/90">Procurement event timeline</p>
      <table className="mt-2 w-full max-w-5xl border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-white/20 text-white/70">
            <th className="py-2 pr-2">Time</th>
            <th className="py-2 pr-2">Type</th>
          </tr>
        </thead>
        <tbody>
          {(events as Record<string, unknown>[]).length === 0 ? (
            <tr>
              <td colSpan={2} className="py-4 text-white/50">
                No events.
              </td>
            </tr>
          ) : (
            (events as Record<string, unknown>[]).map((e) => (
              <tr key={String(e.id)} className="border-b border-white/10 align-top">
                <td className="py-2 pr-2 text-xs whitespace-nowrap">{String(e.created_at ?? "")}</td>
                <td className="py-2 pr-2 font-mono text-xs">{String(e.event_type ?? "")}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <p className="mt-4 text-xs text-white/50">
        <Link href="/admin/procurement" className="text-sky-300 hover:underline">
          ← Procurement overview
        </Link>
      </p>
    </div>
  );
}
