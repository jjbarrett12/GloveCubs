import Link from "next/link";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { fetchApprovedRecommendations, fetchRecommendationReviewQueueEnriched } from "@/lib/procurement/procurement-workspace-read-models";
import { ReviewQueueRow } from "@/app/admin/procurement/ReviewQueueRow";
import { ApprovedReorderRow } from "@/app/admin/procurement/ApprovedReorderRow";

export const dynamic = "force-dynamic";

export default async function ProcurementQueuePage({ params }: { params: { companyId: string } }) {
  const { companyId } = params;
  if (!isSupabaseConfigured()) {
    return <p className="text-white/70">Supabase not configured.</p>;
  }
  const supabase = getSupabaseAdmin() as any;
  const queue = await fetchRecommendationReviewQueueEnriched(supabase, companyId);
  const approved = await fetchApprovedRecommendations(supabase, companyId);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-base font-medium">Review queue</h2>
        <p className="mb-2 text-xs text-white/50">
          <Link href={`/admin/procurement/company/${companyId}`} className="text-sky-300 hover:underline">
            ← Company hub
          </Link>
        </p>
        <table className="w-full max-w-6xl border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-white/20 text-white/70">
              <th className="py-2 pr-2">Id</th>
              <th className="py-2 pr-2">Status</th>
              <th className="py-2 pr-2">Source product</th>
              <th className="py-2 pr-2">Candidate</th>
              <th className="py-2 pr-2 text-right">Δ / basis</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {queue.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-4 text-white/50">
                  No items in review queue.
                </td>
              </tr>
            ) : (
              queue.map((row) => <ReviewQueueRow key={String(row.id)} row={row} companyId={companyId} />)
            )}
          </tbody>
        </table>
      </div>

      <div>
        <h2 className="text-base font-medium">Approved for customer workspace</h2>
        <p className="mb-2 text-xs text-white/60">Promotions require rows in this state (operator-governed; not automatic customer send).</p>
        <table className="w-full max-w-5xl border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-white/20 text-white/70">
              <th className="py-2 pr-2">Id</th>
              <th className="py-2 pr-2">Source product</th>
              <th className="py-2 pr-2 text-right">Δ / basis</th>
              <th className="py-2">Reorder</th>
            </tr>
          </thead>
          <tbody>
            {approved.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-4 text-white/50">
                  None approved yet.
                </td>
              </tr>
            ) : (
              approved.map((row) => <ApprovedReorderRow key={String(row.id)} row={row} companyId={companyId} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
