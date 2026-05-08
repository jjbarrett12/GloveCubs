import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireCustomerProcurementSession } from "@/lib/procurement/customer-procurement-session";
import {
  fetchCustomerApprovedOpportunities,
  fetchCustomerReorderRows,
  fetchCustomerTrustedSpendRows,
} from "@/lib/procurement/customer-procurement-read-models";

export const dynamic = "force-dynamic";

export default async function CustomerProcurementHubPage() {
  const supabase = getSupabaseAdmin() as any;
  const session = await requireCustomerProcurementSession(supabase);
  const [opps, reorder, spend] = await Promise.all([
    fetchCustomerApprovedOpportunities(supabase, session.companyId, 12),
    fetchCustomerReorderRows(supabase, session.companyId, 12),
    fetchCustomerTrustedSpendRows(supabase, session.companyId, 8),
  ]);

  return (
    <div className="space-y-10 text-sm">
      <section>
        <h2 className="text-base font-medium text-white/90">Approved procurement notes</h2>
        <p className="mt-1 text-white/55">
          Economics are computed from trusted invoice observations on a declared basis UOM. They are illustrative, not a
          price commitment.
        </p>
        {opps.length === 0 ? (
          <p className="mt-3 text-white/45">No active approved notes right now.</p>
        ) : (
          <ul className="mt-3 list-inside list-disc space-y-1 text-white/80">
            {opps.slice(0, 5).map((o) => (
              <li key={o.id}>
                <Link href={`/workspace/procurement/opportunities/${o.id}`} className="text-sky-400 hover:underline">
                  {o.source_product.label} → alternate: {o.candidate_product.label}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2">
          <Link href="/workspace/procurement/opportunities" className="text-sky-400 hover:underline">
            View all
          </Link>
        </p>
      </section>

      <section>
        <h2 className="text-base font-medium text-white/90">Reorder</h2>
        {reorder.length === 0 ? (
          <p className="mt-2 text-white/45">No active reorder items.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-white/80">
            {reorder.slice(0, 5).map((r) => (
              <li key={r.id}>
                {r.product_label}{" "}
                <span className="text-white/45">
                  ({r.basis_uom}
                  {r.last_trusted_unit_basis != null ? `, last trusted basis ${r.last_trusted_unit_basis}` : ""})
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2">
          <Link href="/workspace/procurement/reorder" className="text-sky-400 hover:underline">
            Reorder workspace
          </Link>
        </p>
      </section>

      <section>
        <h2 className="text-base font-medium text-white/90">Recent trusted spend</h2>
        {spend.length === 0 ? (
          <p className="mt-2 text-white/45">No trusted observations yet.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-white/80">
            {spend.map((s) => (
              <li key={s.id}>
                {s.product_label}
                {s.supplier_label ? ` — ${s.supplier_label}` : ""}{" "}
                <span className="text-white/45">({s.observed_at.slice(0, 10)})</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2">
          <Link href="/workspace/procurement/spend" className="text-sky-400 hover:underline">
            Full trusted spend history
          </Link>
        </p>
      </section>
    </div>
  );
}
