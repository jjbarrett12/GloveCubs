import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { fetchAnyProcurementOpportunityIdForCompany, fetchReorderMemory } from "@/lib/procurement/procurement-workspace-read-models";
import { ReorderMemoryRow } from "@/app/admin/procurement/ReorderMemoryRow";

export const dynamic = "force-dynamic";

export default async function ProcurementReorderPage({ params }: { params: { companyId: string } }) {
  const admin = await getAdminUser();
  if (!admin) notFound();
  const { companyId } = params;
  if (!isSupabaseConfigured()) notFound();
  const supabase = getSupabaseAdmin() as any;
  const rows = await fetchReorderMemory(supabase, companyId, true);
  const anchorOpp = await fetchAnyProcurementOpportunityIdForCompany(supabase, companyId);

  return (
    <div>
      <h2 className="text-base font-medium">Reorder memory (active)</h2>
      <p className="mb-2 text-xs text-white/50">
        <Link href={`/admin/procurement/company/${companyId}`} className="text-sky-300 hover:underline">
          ← Company hub
        </Link>
      </p>
      {!anchorOpp && (
        <p className="mb-2 text-xs text-amber-300">No procurement opportunity anchor on uploaded invoices — retire action disabled.</p>
      )}
      <table className="w-full max-w-5xl border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-white/20 text-white/70">
            <th className="py-2 pr-2">Id</th>
            <th className="py-2 pr-2">Product</th>
            <th className="py-2 pr-2">Basis</th>
            <th className="py-2 pr-2 text-right">Last trusted basis price</th>
            <th className="py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-4 text-white/50">
                No active reorder rows.
              </td>
            </tr>
          ) : anchorOpp ? (
            (rows as Record<string, unknown>[]).map((r) => (
              <ReorderMemoryRow key={String(r.id)} row={r} companyId={companyId} procurementOpportunityId={anchorOpp} />
            ))
          ) : (
            (rows as Record<string, unknown>[]).map((r) => (
              <tr key={String(r.id)} className="border-b border-white/10">
                <td className="py-2 pr-2 font-mono text-xs">{String(r.id).slice(0, 8)}…</td>
                <td className="py-2 pr-2 font-mono text-xs">{String(r.catalog_product_id).slice(0, 8)}…</td>
                <td className="py-2 pr-2">{String(r.basis_uom)}</td>
                <td className="py-2 pr-2 text-right">{r.last_trusted_unit_basis != null ? String(r.last_trusted_unit_basis) : "—"}</td>
                <td className="py-2 text-xs text-white/50">—</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
