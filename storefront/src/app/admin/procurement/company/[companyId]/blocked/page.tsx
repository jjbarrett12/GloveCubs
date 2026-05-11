import Link from "next/link";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { fetchBlockedRecommendations } from "@/lib/procurement/procurement-workspace-read-models";

export const dynamic = "force-dynamic";

export default async function ProcurementBlockedPage({ params }: { params: { companyId: string } }) {
  const { companyId } = params;
  if (!isSupabaseConfigured()) {
    return <p className="text-white/70">Supabase not configured.</p>;
  }
  const supabase = getSupabaseAdmin() as any;
  const rows = await fetchBlockedRecommendations(supabase, companyId);

  return (
    <div>
      <h2 className="text-base font-medium">Blocked recommendations</h2>
      <p className="mb-2 text-xs text-white/50">
        <Link href={`/admin/procurement/company/${companyId}`} className="text-sky-300 hover:underline">
          ← Company hub
        </Link>
      </p>
      <table className="w-full max-w-5xl border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-white/20 text-white/70">
            <th className="py-2 pr-2">Id</th>
            <th className="py-2 pr-2">Block reason</th>
            <th className="py-2 pr-2">Source line</th>
            <th className="py-2 pr-2">Candidate</th>
            <th className="py-2 pr-2">Created</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-4 text-white/50">
                No blocked rows.
              </td>
            </tr>
          ) : (
            (rows as Record<string, unknown>[]).map((r) => (
              <tr key={String(r.id)} className="border-b border-white/10 align-top">
                <td className="py-2 pr-2 font-mono text-xs">{String(r.id).slice(0, 8)}…</td>
                <td className="py-2 pr-2 text-white/90">{String(r.block_reason ?? "—")}</td>
                <td className="py-2 pr-2 font-mono text-xs">{String(r.source_invoice_line_id).slice(0, 8)}…</td>
                <td className="py-2 pr-2 font-mono text-xs">
                  {r.candidate_catalog_product_id != null ? String(r.candidate_catalog_product_id).slice(0, 8) + "…" : "—"}
                </td>
                <td className="py-2 pr-2 text-xs text-white/60">{String(r.created_at ?? "")}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
