import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireCustomerProcurementSession } from "@/lib/procurement/customer-procurement-session";
import { fetchCustomerReorderRows } from "@/lib/procurement/customer-procurement-read-models";
import { ReorderRequestButton } from "@/app/workspace/procurement/CustomerProcurementClient";

export const dynamic = "force-dynamic";

export default async function CustomerReorderWorkspacePage() {
  const supabase = getSupabaseAdmin() as any;
  const session = await requireCustomerProcurementSession(supabase);
  const rows = await fetchCustomerReorderRows(supabase, session.companyId);

  return (
    <div className="text-sm">
      <p className="mb-4 text-white/55">
        Active reorder items were promoted by your operators from governed procurement notes. Retired items are not
        shown here.
      </p>
      {rows.length === 0 ? (
        <p className="text-white/45">No active reorder items.</p>
      ) : (
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-white/15 text-white/50">
              <th className="py-2 pr-2">Product</th>
              <th className="py-2 pr-2">Basis</th>
              <th className="py-2 pr-2 text-right">Last trusted basis</th>
              <th className="py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-white/10 text-white/80">
                <td className="py-2 pr-2">{r.product_label}</td>
                <td className="py-2 pr-2">{r.basis_uom}</td>
                <td className="py-2 pr-2 text-right">{r.last_trusted_unit_basis != null ? r.last_trusted_unit_basis : "—"}</td>
                <td className="py-2">
                  <ReorderRequestButton reorderMemoryId={r.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
