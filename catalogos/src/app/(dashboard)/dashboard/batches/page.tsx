import Link from "next/link";
import { getBatchesList } from "@/lib/review/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

function StatusBadge({ status }: { status: string }) {
  const v = status === "completed" ? "success" : status === "failed" ? "destructive" : "warning";
  return <Badge variant={v}>{status}</Badge>;
}

export default async function BatchesListPage() {
  let batches: Awaited<ReturnType<typeof getBatchesList>>;
  try {
    batches = await getBatchesList(50);
  } catch (e) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Import Batches</h1>
        <p className="text-destructive">Failed to load batches. Check schema and connection.</p>
      </div>
    );
  }

  const stats = {
    total: batches.length,
    completed: batches.filter((b) => b.status === "completed").length,
    running: batches.filter((b) => b.status === "running").length,
    failed: batches.filter((b) => b.status === "failed").length,
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Import Batches</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-semibold">{stats.total}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-semibold text-emerald-400">{stats.completed}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Running</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-semibold text-amber-400">{stats.running}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Failed</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-semibold text-red-400">{stats.failed}</span>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent batches</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {batches.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">No import batches yet. Run an ingestion from Feeds or API.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 font-medium">Batch</th>
                    <th className="text-left p-3 font-medium">Supplier</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Started</th>
                    <th className="text-left p-3 font-medium">Stats</th>
                    <th className="text-left p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b) => (
                    <tr key={b.id} className="border-b border-border hover:bg-muted/30">
                      <td className="p-3 font-mono text-xs">{b.id.slice(0, 8)}…</td>
                      <td className="p-3">{b.supplier_name ?? b.supplier_id.slice(0, 8)}</td>
                      <td className="p-3"><StatusBadge status={b.status} /></td>
                      <td className="p-3 text-muted-foreground">{new Date(b.started_at).toLocaleString()}</td>
                      <td className="p-3 text-muted-foreground">
                        {b.stats?.raw_count != null && `${b.stats.raw_count} raw → ${b.stats.normalized_count ?? 0} staged`}
                        {b.stats?.matched_count != null && `, ${b.stats.matched_count} matched`}
                      </td>
                      <td className="p-3">
                        <Link href={`/dashboard/batches/${b.id}`} className="text-primary hover:underline">View</Link>
                        <span className="mx-1">·</span>
                        <Link href={`/dashboard/review?batch_id=${b.id}`} className="text-primary hover:underline">Review</Link>
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
