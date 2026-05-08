import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireCustomerProcurementSession } from "@/lib/procurement/customer-procurement-session";
import { fetchCustomerSupplierProductMemory } from "@/lib/procurement/customer-procurement-read-models";

export const dynamic = "force-dynamic";

export default async function CustomerSupplierProductMemoryPage() {
  const supabase = getSupabaseAdmin() as any;
  const session = await requireCustomerProcurementSession(supabase);
  const rows = await fetchCustomerSupplierProductMemory(supabase, session.companyId);

  return (
    <div className="text-sm">
      <p className="mb-4 text-white/55">
        A bounded operational view of the latest trusted observation per product and supplier pairing — not a dashboard
        or benchmark.
      </p>
      {rows.length === 0 ? (
        <p className="text-white/45">No memory rows yet.</p>
      ) : (
        <ul className="space-y-2 text-xs text-white/80">
          {rows.map((m) => (
            <li key={`${m.catalog_product_id}-${m.catalogos_supplier_id ?? "none"}`} className="rounded border border-white/10 px-3 py-2">
              <span className="text-white/90">{m.product_label}</span>
              {m.supplier_label ? <span className="text-white/55"> — {m.supplier_label}</span> : null}
              <span className="block text-white/45">
                Last observed {m.last_observed_at.slice(0, 10)}
                {m.last_unit_price != null ? ` · Recorded unit ${m.last_unit_price}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
