import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { fetchTrustedSpendHistory } from "@/lib/procurement/procurement-workspace-read-models";
import { PageHeader, PageSection, TableCard, EmptyState } from "@/components/admin";

export const dynamic = "force-dynamic";

export default async function ProcurementSpendPage({ params }: { params: { companyId: string } }) {
  const { companyId } = params;
  if (!isSupabaseConfigured()) {
    return (
      <div>
        <PageHeader
          title="Trusted spend history"
          breadcrumb={[
            { label: "Procurement", href: "/admin/procurement" },
            { label: "Company", href: `/admin/procurement/company/${companyId}` },
            { label: "Spend" },
          ]}
        />
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Supabase not configured.
        </div>
      </div>
    );
  }
  const supabase = getSupabaseAdmin() as any;
  const rows = await fetchTrustedSpendHistory(supabase, companyId);
  const list = rows as Record<string, unknown>[];

  return (
    <div>
      <PageHeader
        title="Trusted spend history"
        breadcrumb={[
          { label: "Procurement", href: "/admin/procurement" },
          { label: "Company", href: `/admin/procurement/company/${companyId}` },
          { label: "Spend" },
        ]}
      />

      <PageSection>
        <TableCard>
          {list.length === 0 ? (
            <EmptyState title="No trusted observations" description="No spend observations recorded for this company." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="p-3">Observed</th>
                    <th className="p-3">Product</th>
                    <th className="p-3">Supplier</th>
                    <th className="p-3 text-right">Unit price</th>
                    <th className="p-3 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {list.map((r) => (
                    <tr key={String(r.id)} className="hover:bg-blue-50/40">
                      <td className="p-3 text-xs text-gray-600">{String(r.observed_at ?? "")}</td>
                      <td className="p-3 font-mono text-xs text-gray-700">{String(r.catalog_product_id).slice(0, 8)}…</td>
                      <td className="p-3 font-mono text-xs text-gray-700">{String(r.catalogos_supplier_id).slice(0, 8)}…</td>
                      <td className="p-3 text-right font-mono tabular-nums text-gray-900">{String(r.unit_price ?? "")}</td>
                      <td className="p-3 text-right font-mono tabular-nums text-gray-900">{String(r.quantity ?? "")}</td>
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
