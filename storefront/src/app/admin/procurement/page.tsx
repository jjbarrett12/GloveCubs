import Link from "next/link";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { fetchCompaniesWithRecommendations } from "@/lib/procurement/procurement-workspace-read-models";

export const dynamic = "force-dynamic";

export default async function ProcurementOverviewPage() {
  if (!isSupabaseConfigured()) {
    return <p className="text-white/70">Supabase not configured.</p>;
  }
  const supabase = getSupabaseAdmin() as any;
  const rows = await fetchCompaniesWithRecommendations(supabase, 50);

  return (
    <div>
      <h2 className="mb-3 text-base font-medium">Companies with procurement signals</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-white/60">No savings opportunities or blocked rows yet.</p>
      ) : (
        <table className="w-full max-w-3xl border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-white/20 text-white/70">
              <th className="py-2 pr-2">Company</th>
              <th className="py-2 pr-2 text-right">Open queue</th>
              <th className="py-2 pr-2 text-right">Blocked</th>
              <th className="py-2">Workspace</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.company_id} className="border-b border-white/10">
                <td className="py-2 pr-2">{r.company_name ?? r.company_id}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{r.open_count}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{r.blocked_count}</td>
                <td className="py-2">
                  <Link className="text-sky-300 hover:underline" href={`/admin/procurement/company/${r.company_id}`}>
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
