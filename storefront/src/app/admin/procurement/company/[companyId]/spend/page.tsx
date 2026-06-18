import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { fetchTrustedSpendHistory } from "@/lib/procurement/procurement-workspace-read-models";
import { ProcurementTableShell, adminTableRowHover } from "@/app/admin/procurement/_ProcurementTableShell";
import { ErrorState, PageHeader, PageSection, TableCard, EmptyState } from "@/components/admin";
import { adminTableCell } from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";

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
        <ErrorState
          title="Database not configured"
          message="Spend history cannot be loaded in this environment. Review Admin Health for configuration status."
        />
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
            <ProcurementTableShell
              headers={[
                { label: "Observed" },
                { label: "Product" },
                { label: "Supplier" },
                { label: "Unit price", align: "right" },
                { label: "Qty", align: "right" },
              ]}
            >
              {list.map((r) => (
                <tr key={String(r.id)} className={adminTableRowHover}>
                  <td className={cn(adminTableCell, "p-3 text-xs")}>{String(r.observed_at ?? "")}</td>
                  <td className={cn(adminTableCell, "p-3 font-mono text-xs")}>
                    {String(r.catalog_product_id).slice(0, 8)}…
                  </td>
                  <td className={cn(adminTableCell, "p-3 font-mono text-xs")}>
                    {String(r.catalogos_supplier_id).slice(0, 8)}…
                  </td>
                  <td className={cn(adminTableCell, "p-3 text-right font-mono tabular-nums")}>
                    {String(r.unit_price ?? "")}
                  </td>
                  <td className={cn(adminTableCell, "p-3 text-right font-mono tabular-nums")}>
                    {String(r.quantity ?? "")}
                  </td>
                </tr>
              ))}
            </ProcurementTableShell>
          )}
        </TableCard>
      </PageSection>
    </div>
  );
}
