import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { fetchSupplierObservationSummary } from "@/lib/procurement/procurement-workspace-read-models";
import { ProcurementTableShell, adminTableRowHover } from "@/app/admin/procurement/_ProcurementTableShell";
import { ErrorState, PageHeader, PageSection, TableCard, EmptyState } from "@/components/admin";
import { adminTableCell } from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ProcurementSuppliersPage({ params }: { params: { companyId: string } }) {
  const { companyId } = params;
  if (!isSupabaseConfigured()) {
    return (
      <div>
        <PageHeader
          title="Supplier activity"
          breadcrumb={[
            { label: "Sourcing", href: "/admin/procurement" },
            { label: "Company", href: `/admin/procurement/company/${companyId}` },
            { label: "Suppliers" },
          ]}
        />
        <ErrorState
          title="Database not configured"
          message="Supplier activity cannot be loaded in this environment. Review Admin Health for configuration status."
        />
      </div>
    );
  }
  const supabase = getSupabaseAdmin() as any;
  const rows = await fetchSupplierObservationSummary(supabase, companyId);

  return (
    <div>
      <PageHeader
        title="Supplier activity"
        description="Recent verified supplier touchpoints from invoice data—summary only."
        breadcrumb={[
          { label: "Sourcing", href: "/admin/procurement" },
          { label: "Company", href: `/admin/procurement/company/${companyId}` },
          { label: "Suppliers" },
        ]}
      />

      <PageSection>
        <TableCard>
          {rows.length === 0 ? (
            <EmptyState title="No supplier rows yet" description="Nothing in the current scan window for this account." />
          ) : (
            <ProcurementTableShell
              headers={[
                { label: "Supplier ID" },
                { label: "Rows (in scan)", align: "right" },
                { label: "Last observed" },
              ]}
            >
              {rows.map((r) => (
                <tr key={r.catalogos_supplier_id} className={adminTableRowHover}>
                  <td className={cn(adminTableCell, "p-3 font-mono text-xs")}>{r.catalogos_supplier_id}</td>
                  <td className={cn(adminTableCell, "p-3 text-right font-mono tabular-nums")}>{r.observation_count}</td>
                  <td className={cn(adminTableCell, "p-3 text-xs")}>{r.last_observed_at ?? "—"}</td>
                </tr>
              ))}
            </ProcurementTableShell>
          )}
        </TableCard>
      </PageSection>
    </div>
  );
}
