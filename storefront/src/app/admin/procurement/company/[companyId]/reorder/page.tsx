import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { fetchAnyProcurementOpportunityIdForCompany, fetchReorderMemory } from "@/lib/procurement/procurement-workspace-read-models";
import { ReorderMemoryRow } from "@/app/admin/procurement/ReorderMemoryRow";
import { PageHeader, PageSection, TableCard, EmptyState } from "@/components/admin";

export const dynamic = "force-dynamic";

export default async function ProcurementReorderPage({ params }: { params: { companyId: string } }) {
  const { companyId } = params;
  if (!isSupabaseConfigured()) {
    return (
      <div>
        <PageHeader
          title="Reorder memory"
          breadcrumb={[
            { label: "Procurement", href: "/admin/procurement" },
            { label: "Company", href: `/admin/procurement/company/${companyId}` },
            { label: "Reorder" },
          ]}
        />
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Supabase not configured.
        </div>
      </div>
    );
  }
  const supabase = getSupabaseAdmin() as any;
  const rows = await fetchReorderMemory(supabase, companyId, true);
  const anchorOpp = await fetchAnyProcurementOpportunityIdForCompany(supabase, companyId);

  return (
    <div>
      <PageHeader
        title="Reorder memory (active)"
        breadcrumb={[
          { label: "Procurement", href: "/admin/procurement" },
          { label: "Company", href: `/admin/procurement/company/${companyId}` },
          { label: "Reorder" },
        ]}
      />

      {!anchorOpp ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          No procurement opportunity anchor on uploaded invoices — retire action disabled.
        </div>
      ) : null}

      <PageSection>
        <TableCard>
          {rows.length === 0 ? (
            <EmptyState title="No active reorder rows" description="Nothing in reorder memory for this company." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="p-3">Id</th>
                    <th className="p-3">Product</th>
                    <th className="p-3">Basis</th>
                    <th className="p-3 text-right">Last trusted basis price</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {anchorOpp ? (
                    (rows as Record<string, unknown>[]).map((r) => (
                      <ReorderMemoryRow
                        key={String(r.id)}
                        row={r}
                        companyId={companyId}
                        procurementOpportunityId={anchorOpp}
                      />
                    ))
                  ) : (
                    (rows as Record<string, unknown>[]).map((r) => (
                      <tr key={String(r.id)} className="hover:bg-blue-50/40">
                        <td className="p-3 font-mono text-xs text-gray-700">{String(r.id).slice(0, 8)}…</td>
                        <td className="p-3 font-mono text-xs text-gray-700">{String(r.catalog_product_id).slice(0, 8)}…</td>
                        <td className="p-3 text-gray-900">{String(r.basis_uom)}</td>
                        <td className="p-3 text-right font-mono tabular-nums text-gray-900">
                          {r.last_trusted_unit_basis != null ? String(r.last_trusted_unit_basis) : "—"}
                        </td>
                        <td className="p-3 text-xs text-gray-400">—</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </TableCard>
      </PageSection>
    </div>
  );
}
