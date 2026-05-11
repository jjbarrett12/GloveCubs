import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireCustomerProcurementSession } from "@/lib/procurement/customer-procurement-session";
import {
  fetchCustomerApprovedOpportunities,
  fetchCustomerProcurementLifecycleRows,
  fetchCustomerProcurementTimeline,
  fetchCustomerReorderRows,
  fetchCustomerTrustedSpendRows,
} from "@/lib/procurement/customer-procurement-read-models";
import { ProcurementCommandCenter } from "@/app/workspace/procurement/_components/ProcurementCommandCenter";

export const dynamic = "force-dynamic";

export default async function CustomerProcurementHubPage() {
  const supabase = getSupabaseAdmin() as any;
  const session = await requireCustomerProcurementSession(supabase);

  const [opps, reorder, spend, timeline, lifecycleRows, companyRes] = await Promise.all([
    fetchCustomerApprovedOpportunities(supabase, session.companyId, 24),
    fetchCustomerReorderRows(supabase, session.companyId, 24),
    fetchCustomerTrustedSpendRows(supabase, session.companyId, 8),
    fetchCustomerProcurementTimeline(supabase, session.companyId, 8),
    fetchCustomerProcurementLifecycleRows(supabase, session.companyId),
    supabase.schema("gc_commerce").from("companies").select("trade_name").eq("id", session.companyId).maybeSingle(),
  ]);

  const trade = companyRes.data && typeof (companyRes.data as { trade_name?: string }).trade_name === "string"
    ? (companyRes.data as { trade_name: string }).trade_name.trim()
    : "";
  const companyLabel = trade || "Your organization";

  return (
    <ProcurementCommandCenter
      companyLabel={companyLabel}
      approved={opps}
      reorder={reorder}
      spend={spend}
      timeline={timeline}
      lifecycleRows={lifecycleRows}
    />
  );
}
