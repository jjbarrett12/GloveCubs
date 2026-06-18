import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { fetchAnyProcurementOpportunityIdForCompany, fetchReorderMemory } from "@/lib/procurement/procurement-workspace-read-models";
import { ReorderMemoryRow } from "@/app/admin/procurement/ReorderMemoryRow";
import { ProcurementTableShell, adminTableRowHover } from "@/app/admin/procurement/_ProcurementTableShell";
import { ErrorState, PageHeader, PageSection, TableCard, EmptyState } from "@/components/admin";
import { adminAlertSurface, adminTableCell } from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";

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
        <ErrorState
          title="Database not configured"
          message="Reorder memory cannot be loaded in this environment. Review Admin Health for configuration status."
        />
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
        <div className={cn(adminAlertSurface("warning"), "mb-4")} role="status">
          No procurement opportunity anchor on uploaded invoices — retire action disabled.
        </div>
      ) : null}

      <PageSection>
        <TableCard>
          {rows.length === 0 ? (
            <EmptyState title="No active reorder rows" description="Nothing in reorder memory for this company." />
          ) : (
            <ProcurementTableShell
              headers={[
                { label: "Id" },
                { label: "Product" },
                { label: "Basis" },
                { label: "Last trusted basis price", align: "right" },
                { label: "Actions" },
              ]}
            >
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
                  <tr key={String(r.id)} className={adminTableRowHover}>
                    <td className={cn(adminTableCell, "p-3 font-mono text-xs")}>{String(r.id).slice(0, 8)}…</td>
                    <td className={cn(adminTableCell, "p-3 font-mono text-xs")}>
                      {String(r.catalog_product_id).slice(0, 8)}…
                    </td>
                    <td className={cn(adminTableCell, "p-3")}>{String(r.basis_uom)}</td>
                    <td className={cn(adminTableCell, "p-3 text-right font-mono tabular-nums")}>
                      {r.last_trusted_unit_basis != null ? String(r.last_trusted_unit_basis) : "—"}
                    </td>
                    <td className={cn(adminTableCell, "p-3 text-xs text-admin-muted")}>—</td>
                  </tr>
                ))
              )}
            </ProcurementTableShell>
          )}
        </TableCard>
      </PageSection>
    </div>
  );
}
