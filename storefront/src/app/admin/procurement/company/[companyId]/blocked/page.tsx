import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { fetchBlockedRecommendations } from "@/lib/procurement/procurement-workspace-read-models";
import { ProcurementTableShell, adminTableRowHover } from "@/app/admin/procurement/_ProcurementTableShell";
import { ErrorState, PageHeader, PageSection, TableCard, EmptyState } from "@/components/admin";
import { adminTableCell } from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ProcurementBlockedPage({ params }: { params: { companyId: string } }) {
  const { companyId } = params;
  if (!isSupabaseConfigured()) {
    return (
      <div>
        <PageHeader
          title="Blocked recommendations"
          breadcrumb={[
            { label: "Procurement", href: "/admin/procurement" },
            { label: "Company", href: `/admin/procurement/company/${companyId}` },
            { label: "Blocked" },
          ]}
        />
        <ErrorState
          title="Database not configured"
          message="Blocked recommendations cannot be loaded in this environment. Review Admin Health for configuration status."
        />
      </div>
    );
  }
  const supabase = getSupabaseAdmin() as any;
  const rows = await fetchBlockedRecommendations(supabase, companyId);

  return (
    <div>
      <PageHeader
        title="Blocked recommendations"
        breadcrumb={[
          { label: "Procurement", href: "/admin/procurement" },
          { label: "Company", href: `/admin/procurement/company/${companyId}` },
          { label: "Blocked" },
        ]}
      />

      <PageSection>
        <TableCard>
          {rows.length === 0 ? (
            <EmptyState title="No blocked rows" description="Nothing blocked for this company." />
          ) : (
            <ProcurementTableShell
              headers={[
                { label: "Id" },
                { label: "Block reason" },
                { label: "Source line" },
                { label: "Candidate" },
                { label: "Created" },
              ]}
            >
              {(rows as Record<string, unknown>[]).map((r) => (
                <tr key={String(r.id)} className={cn(adminTableRowHover, "align-top")}>
                  <td className={cn(adminTableCell, "p-3 font-mono text-xs")}>{String(r.id).slice(0, 8)}…</td>
                  <td className={cn(adminTableCell, "p-3")}>{String(r.block_reason ?? "—")}</td>
                  <td className={cn(adminTableCell, "p-3 font-mono text-xs")}>
                    {String(r.source_invoice_line_id).slice(0, 8)}…
                  </td>
                  <td className={cn(adminTableCell, "p-3 font-mono text-xs")}>
                    {r.candidate_catalog_product_id != null
                      ? String(r.candidate_catalog_product_id).slice(0, 8) + "…"
                      : "—"}
                  </td>
                  <td className={cn(adminTableCell, "p-3 text-xs")}>{String(r.created_at ?? "")}</td>
                </tr>
              ))}
            </ProcurementTableShell>
          )}
        </TableCard>
      </PageSection>
    </div>
  );
}
