import Link from "next/link";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { fetchSupplierObservationSummary } from "@/lib/procurement/procurement-workspace-read-models";

export const dynamic = "force-dynamic";

export default async function ProcurementSuppliersPage({ params }: { params: { companyId: string } }) {
  const { companyId } = params;
  if (!isSupabaseConfigured()) {
    return <p className="text-white/70">Supabase not configured.</p>;
  }
  const supabase = getSupabaseAdmin() as any;
  const rows = await fetchSupplierObservationSummary(supabase, companyId);

  return (
    <div>
      <h2 className="text-base font-medium">Supplier observation summary</h2>
      <p className="mb-2 text-xs text-white/50">
        <Link href={`/admin/procurement/company/${companyId}`} className="text-sky-300 hover:underline">
          ← Company hub
        </Link>
      </p>
      <p className="mb-3 text-xs text-white/50">Bounded scan of recent trusted observations — operational summary only.</p>
      <table className="w-full max-w-4xl border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-white/20 text-white/70">
            <th className="py-2 pr-2">CatalogOS supplier</th>
            <th className="py-2 pr-2 text-right">Rows (in scan)</th>
            <th className="py-2 pr-2">Last observed</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={3} className="py-4 text-white/50">
                No data.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.catalogos_supplier_id} className="border-b border-white/10">
                <td className="py-2 pr-2 font-mono text-xs">{r.catalogos_supplier_id}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{r.observation_count}</td>
                <td className="py-2 pr-2 text-xs">{r.last_observed_at ?? "—"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
