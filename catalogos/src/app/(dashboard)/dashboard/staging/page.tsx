import { getSupabase } from "@/lib/db/client";
import Link from "next/link";

type SearchParams = { batch_id?: string; status?: string };

export default async function StagingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { batch_id, status } = await searchParams;
  const supabase = getSupabase(false);
  let query = supabase
    .from("catalogos_staging_products")
    .select("id, batch_id, raw_id, supplier_id, normalized_json, attributes_json, master_product_id, match_confidence, status")
    .order("created_at", { ascending: false })
    .limit(100);
  if (batch_id) query = query.eq("batch_id", batch_id);
  if (status) query = query.eq("status", status);
  const { data: rows } = await query;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Staging products</h1>
      <div className="flex gap-2 mb-4">
        <Link href="/dashboard/staging?status=pending" className="rounded border border-border px-3 py-1 text-sm hover:bg-muted">Pending</Link>
        <Link href="/dashboard/staging?status=approved" className="rounded border border-border px-3 py-1 text-sm hover:bg-muted">Approved</Link>
        <Link href="/dashboard/staging" className="rounded border border-border px-3 py-1 text-sm hover:bg-muted">All</Link>
      </div>
      <div className="rounded border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-2">ID</th>
              <th className="text-left p-2">Batch</th>
              <th className="text-left p-2">Name</th>
              <th className="text-left p-2">Match</th>
              <th className="text-left p-2">Status</th>
              <th className="text-left p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(!rows || rows.length === 0) && (
              <tr><td colSpan={6} className="p-4 text-muted-foreground">No staging products.</td></tr>
            )}
            {(rows ?? []).map((r: {
              id: number;
              batch_id: number;
              normalized_json: Record<string, unknown>;
              match_confidence: number | null;
              status: string;
            }) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-2 font-mono">{r.id}</td>
                <td className="p-2">{r.batch_id}</td>
                <td className="p-2">{(r.normalized_json?.name ?? "—") as string}</td>
                <td className="p-2">{r.match_confidence != null ? `${(r.match_confidence * 100).toFixed(0)}%` : "—"}</td>
                <td className="p-2">{r.status}</td>
                <td className="p-2">
                  <Link href={`/dashboard/review/${r.id}`} className="text-primary hover:underline">Review</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
