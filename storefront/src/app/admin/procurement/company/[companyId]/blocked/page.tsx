import Link from "next/link";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { fetchBlockedRecommendations } from "@/lib/procurement/procurement-workspace-read-models";
import { PageHeader, PageSection, TableCard, EmptyState } from "@/components/admin";

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
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Supabase not configured.
        </div>
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
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="p-3">Id</th>
                    <th className="p-3">Block reason</th>
                    <th className="p-3">Source line</th>
                    <th className="p-3">Candidate</th>
                    <th className="p-3">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {(rows as Record<string, unknown>[]).map((r) => (
                    <tr key={String(r.id)} className="align-top hover:bg-blue-50/40">
                      <td className="p-3 font-mono text-xs text-gray-700">{String(r.id).slice(0, 8)}…</td>
                      <td className="p-3 text-gray-900">{String(r.block_reason ?? "—")}</td>
                      <td className="p-3 font-mono text-xs text-gray-700">{String(r.source_invoice_line_id).slice(0, 8)}…</td>
                      <td className="p-3 font-mono text-xs text-gray-700">
                        {r.candidate_catalog_product_id != null
                          ? String(r.candidate_catalog_product_id).slice(0, 8) + "…"
                          : "—"}
                      </td>
                      <td className="p-3 text-xs text-gray-600">{String(r.created_at ?? "")}</td>
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
