import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireCustomerProcurementSession } from "@/lib/procurement/customer-procurement-session";
import { fetchCustomerTrustedSpendRows } from "@/lib/procurement/customer-procurement-read-models";

export const dynamic = "force-dynamic";

export default async function CustomerTrustedSpendPage() {
  const supabase = getSupabaseAdmin() as any;
  const session = await requireCustomerProcurementSession(supabase);
  const rows = await fetchCustomerTrustedSpendRows(supabase, session.companyId, 120);

  return (
    <div className="text-sm">
      <p className="mb-4 text-white/55">
        Verified spend observations from governed invoice lines appear here. Lines not yet verified for your
        organization are excluded. Illustrative — not a financial statement; not final pricing.
      </p>
      {rows.length === 0 ? (
        <p className="text-white/45">No verified spend observations yet.</p>
      ) : (
        <ul className="space-y-2 text-white/80">
          {rows.map((s) => (
            <li key={s.id} className="rounded border border-white/10 px-3 py-2 text-xs">
              <span className="text-white/90">{s.product_label}</span>
              {s.supplier_label ? <span className="text-white/55"> — {s.supplier_label}</span> : null}
              <span className="block text-white/45">
                Observed {s.observed_at.slice(0, 10)}
                {s.unit_price != null ? ` · Unit ${s.unit_price}` : ""}
                {s.line_total != null ? ` · Line ${s.line_total}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
