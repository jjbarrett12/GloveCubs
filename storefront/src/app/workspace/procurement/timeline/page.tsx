import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireCustomerProcurementSession } from "@/lib/procurement/customer-procurement-session";
import { fetchCustomerProcurementTimeline } from "@/lib/procurement/customer-procurement-read-models";
import { ContactAdvisorForm, RecordViewedProcurementHistory } from "@/app/workspace/procurement/CustomerProcurementClient";

export const dynamic = "force-dynamic";

export default async function CustomerProcurementTimelinePage() {
  const supabase = getSupabaseAdmin() as any;
  const session = await requireCustomerProcurementSession(supabase);
  const rows = await fetchCustomerProcurementTimeline(supabase, session.companyId);

  return (
    <div className="text-sm">
      <RecordViewedProcurementHistory />
      <p className="mb-4 text-white/55">
        Chronological procurement activity your workspace is allowed to see. Internal matching, extraction, and
        governance reject events are not listed.
      </p>
      {rows.length === 0 ? (
        <p className="text-white/45">No timeline entries yet.</p>
      ) : (
        <ol className="space-y-3 border-l border-white/15 pl-4">
          {rows.map((r) => (
            <li key={r.id} className="relative text-xs">
              <span className="absolute -left-[17px] top-1.5 h-2 w-2 rounded-full bg-sky-500/80" aria-hidden />
              <p className="font-medium text-white/85">{r.headline}</p>
              <p className="text-white/45">{r.occurred_at.slice(0, 19).replace("T", " ")} UTC</p>
              {r.detail ? <p className="mt-1 text-white/55">{r.detail}</p> : null}
            </li>
          ))}
        </ol>
      )}
      <ContactAdvisorForm />
    </div>
  );
}
