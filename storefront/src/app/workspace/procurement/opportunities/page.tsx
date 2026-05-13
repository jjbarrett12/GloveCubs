import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireCustomerProcurementSession } from "@/lib/procurement/customer-procurement-session";
import { fetchCustomerApprovedOpportunities } from "@/lib/procurement/customer-procurement-read-models";

export const dynamic = "force-dynamic";

export default async function CustomerApprovedOpportunitiesPage() {
  const supabase = getSupabaseAdmin() as any;
  const session = await requireCustomerProcurementSession(supabase);
  const rows = await fetchCustomerApprovedOpportunities(supabase, session.companyId);

  return (
    <div className="text-sm">
      <p className="mb-4 text-white/55">
        Each row is a reviewed approval for your organization, tied to verified spend from your invoices. Economics are
        illustrative on the stated basis UOM—not a commitment or final pricing.
      </p>
      {rows.length === 0 ? (
        <p className="text-white/45">No active approvals right now.</p>
      ) : (
        <ul className="space-y-4">
          {rows.map((o) => (
            <li key={o.id} className="rounded border border-white/10 p-4">
              <Link href={`/workspace/procurement/opportunities/${o.id}`} className="font-medium text-sky-400 hover:underline">
                {o.source_product.label} → {o.candidate_product.label}
              </Link>
              <p className="mt-1 text-xs text-white/50">
                Basis: {o.basis_uom} · Approved {o.approved_for_customer_at?.slice(0, 10) ?? "—"}
              </p>
              <p className="mt-1 text-xs text-white/60">
                Trusted observation dates: source {o.economics.observed_at_source.slice(0, 10)}, alternate{" "}
                {o.economics.observed_at_candidate.slice(0, 10)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
