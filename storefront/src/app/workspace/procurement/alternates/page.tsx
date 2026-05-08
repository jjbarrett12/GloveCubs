import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireCustomerProcurementSession } from "@/lib/procurement/customer-procurement-session";
import { fetchCustomerApprovedOpportunities } from "@/lib/procurement/customer-procurement-read-models";

export const dynamic = "force-dynamic";

export default async function CustomerApprovedAlternatesPage() {
  const supabase = getSupabaseAdmin() as any;
  const session = await requireCustomerProcurementSession(supabase);
  const rows = await fetchCustomerApprovedOpportunities(supabase, session.companyId);

  return (
    <div className="text-sm">
      <p className="mb-4 text-white/55">
        Approved alternates are governed substitutions your operators released for your workspace. They exclude draft
        matches, blocked paths, and unreviewed suggestions.
      </p>
      {rows.length === 0 ? (
        <p className="text-white/45">No approved alternates to show.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((o) => (
            <li key={o.id}>
              <Link href={`/workspace/procurement/opportunities/${o.id}`} className="text-sky-400 hover:underline">
                {o.source_product.label} → {o.candidate_product.label}
              </Link>
              <span className="ml-2 text-xs text-white/45">({o.basis_uom})</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
