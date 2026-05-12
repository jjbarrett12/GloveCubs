import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { fetchSupplierObservationSummary } from "@/lib/procurement/procurement-workspace-read-models";
import { PageHeader, PageSection, TableCard, EmptyState } from "@/components/admin";

export const dynamic = "force-dynamic";

export default async function ProcurementSuppliersPage({ params }: { params: { companyId: string } }) {
  const { companyId } = params;
  if (!isSupabaseConfigured()) {
    return (
      <div>
        <PageHeader
          title="Supplier observation summary"
          breadcrumb={[
            { label: "Procurement", href: "/admin/procurement" },
            { label: "Company", href: `/admin/procurement/company/${companyId}` },
            { label: "Suppliers" },
          ]}
        />
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Supabase not configured.
        </div>
      </div>
    );
  }
  const supabase = getSupabaseAdmin() as any;
  const rows = await fetchSupplierObservationSummary(supabase, companyId);

  return (
    <div>
      <PageHeader
        title="Supplier observation summary"
        description="Bounded scan of recent trusted observations — operational summary only."
        breadcrumb={[
          { label: "Procurement", href: "/admin/procurement" },
          { label: "Company", href: `/admin/procurement/company/${companyId}` },
          { label: "Suppliers" },
        ]}
      />

      <PageSection>
        <TableCard>
          {rows.length === 0 ? (
            <EmptyState title="No data" description="No supplier observations in the current scan window." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="p-3">CatalogOS supplier</th>
                    <th className="p-3 text-right">Rows (in scan)</th>
                    <th className="p-3">Last observed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {rows.map((r) => (
                    <tr key={r.catalogos_supplier_id} className="hover:bg-blue-50/40">
                      <td className="p-3 font-mono text-xs text-gray-900">{r.catalogos_supplier_id}</td>
                      <td className="p-3 text-right font-mono tabular-nums text-gray-900">{r.observation_count}</td>
                      <td className="p-3 text-xs text-gray-600">{r.last_observed_at ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TableCard>
      </PageSection>
    </div>
  );
}
