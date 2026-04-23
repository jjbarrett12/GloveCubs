import Link from "next/link";
import { notFound } from "next/navigation";
import { getBatchById } from "@/lib/review/data";
import { getStagingRows } from "@/lib/review/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function StatusBadge({ status }: { status: string }) {
  const v = status === "completed" ? "success" : status === "failed" ? "destructive" : "warning";
  return <Badge variant={v}>{status}</Badge>;
}

export default async function BatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const batch = await getBatchById(id);
  if (!batch) notFound();

  const staging = await getStagingRows({ batch_id: id, limit: 200 });
  const supplierName = (batch.supplier as { name?: string })?.name ?? "—";
  const stats = (batch.stats as Record<string, number>) ?? {};

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/batches" className="text-muted-foreground hover:text-foreground text-sm">← Batches</Link>
        <h1 className="text-2xl font-bold tracking-tight">Batch {id.slice(0, 8)}…</h1>
        <StatusBadge status={String(batch.status)} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Supplier</CardTitle></CardHeader>
          <CardContent className="text-sm">{supplierName}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Raw count</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{stats.raw_count ?? 0}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Staged</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{stats.normalized_count ?? staging.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Matched</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold text-emerald-400">{stats.matched_count ?? staging.filter((s) => s.master_product_id).length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">With anomalies</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold text-amber-400">{stats.anomaly_row_count ?? staging.filter((s) => ((s.normalized_data as { anomaly_flags?: unknown[] })?.anomaly_flags?.length ?? 0) > 0).length}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Staged products in this batch</CardTitle>
          <Link href={`/dashboard/review?batch_id=${id}`}>
            <Button size="sm">Open in Review queue</Button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {staging.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">No staged rows for this batch.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 font-medium">SKU</th>
                    <th className="text-left p-3 font-medium">Name</th>
                    <th className="text-left p-3 font-medium">Match</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {staging.map((s) => (
                    <tr key={s.id} className="border-b border-border hover:bg-muted/30">
                      <td className="p-3 font-mono text-xs">{(s.normalized_data as { sku?: string })?.sku ?? "—"}</td>
                      <td className="p-3 max-w-[200px] truncate">{(s.normalized_data as { name?: string })?.name ?? "—"}</td>
                      <td className="p-3">
                        {s.match_confidence != null ? (
                          <span className={s.match_confidence >= 0.6 ? "text-emerald-400" : "text-amber-400"}>{(s.match_confidence * 100).toFixed(0)}%</span>
                        ) : "—"}
                      </td>
                      <td className="p-3"><Badge variant={s.status === "approved" ? "success" : s.status === "rejected" ? "destructive" : "secondary"}>{s.status}</Badge></td>
                      <td className="p-3">
                        <Link href={`/dashboard/review?id=${s.id}`} className="text-primary hover:underline">Review</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
