import Link from "next/link";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { fetchCompaniesWithRecommendations } from "@/lib/procurement/procurement-workspace-read-models";
import { PageHeader, TableCard, EmptyState } from "@/components/admin";

export const dynamic = "force-dynamic";

export default async function ProcurementOverviewPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div>
        <PageHeader title="Procurement review" description="Supabase not configured." />
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to load procurement signals.
        </div>
      </div>
    );
  }

  const supabase = getSupabaseAdmin() as any;
  const rows = await fetchCompaniesWithRecommendations(supabase, 50);

  return (
    <div>
      <PageHeader
        title="Procurement review"
        description="Companies with open procurement review queues — savings opportunities and blocked rows."
      />

      <TableCard>
        {rows.length === 0 ? (
          <EmptyState
            title="No signals yet"
            description="No savings opportunities or blocked rows yet."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="p-3">Company</th>
                  <th className="p-3 text-right">Open review</th>
                  <th className="p-3 text-right">Blocked</th>
                  <th className="p-3">Workspace</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {rows.map((r) => (
                  <tr key={r.company_id} className="hover:bg-blue-50/40">
                    <td className="p-3 text-gray-900">{r.company_name ?? r.company_id}</td>
                    <td className="p-3 text-right font-mono tabular-nums text-gray-700">{r.open_count}</td>
                    <td className="p-3 text-right font-mono tabular-nums text-gray-700">{r.blocked_count}</td>
                    <td className="p-3">
                      <Link
                        className="text-sm font-medium text-blue-700 hover:underline"
                        href={`/admin/procurement/company/${r.company_id}`}
                      >
                        Open →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </TableCard>
    </div>
  );
}
