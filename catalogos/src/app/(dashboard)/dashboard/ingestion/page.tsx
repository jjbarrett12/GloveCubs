import Link from "next/link";
import { getIngestionBatchSummaries } from "@/lib/review/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function StatusBadge({ status }: { status: string }) {
  const v = status === "completed" ? "success" : status === "failed" ? "destructive" : "warning";
  return <Badge variant={v}>{status}</Badge>;
}

function SourceBadge({ source_type }: { source_type?: string }) {
  const label = source_type === "feed" ? "CSV/Feed" : source_type === "url" ? "URL" : "Manual";
  return <Badge variant="outline">{label}</Badge>;
}

export default async function IngestionConsolePage() {
  let summaries: Awaited<ReturnType<typeof getIngestionBatchSummaries>>;
  try {
    summaries = await getIngestionBatchSummaries(30);
  } catch (e) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Ingestion Console</h1>
        <p className="text-destructive">Failed to load batches.</p>
      </div>
    );
  }

  const needsReview = summaries.filter((s) => s.review_required_rows > 0);
  const readyToPublish = summaries.filter((s) => s.accepted_rows > 0 && s.accepted_rows > s.published_rows);
  const failed = summaries.filter((s) => s.status === "failed");
  const withDuplicateWarnings = summaries.filter((s) => s.duplicate_warning_rows > 0);
  const withSearchSyncIssues = summaries.filter((s) => s.sync_failed_rows > 0 || s.pending_search_sync_rows > 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Ingestion Console</h1>
        <div className="flex gap-2">
          <Link href="/dashboard/feeds">
            <Button variant="outline" size="sm">Upload file</Button>
          </Link>
          <Link href="/dashboard/review">
            <Button variant="outline" size="sm">Review pending</Button>
          </Link>
          <Link href="/dashboard/publish">
            <Button size="sm">Publish approved</Button>
          </Link>
        </div>
      </div>

      {/* Action queue */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Needs review</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-semibold">{needsReview.length}</span>
            <span className="text-muted-foreground text-sm ml-1">batches</span>
          </CardContent>
          {needsReview.length > 0 && (
            <CardContent className="pt-0">
              <Link href={`/dashboard/ingestion/${needsReview[0].id}`} className="text-primary text-sm hover:underline">View first →</Link>
            </CardContent>
          )}
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ready to publish</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-semibold text-emerald-600">{readyToPublish.length}</span>
            <span className="text-muted-foreground text-sm ml-1">batches</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Failed</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-semibold text-red-500">{failed.length}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Duplicate warnings</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-semibold text-amber-600">{withDuplicateWarnings.length}</span>
            <span className="text-muted-foreground text-sm ml-1">batches</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Storefront sync</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-semibold text-amber-700">{withSearchSyncIssues.length}</span>
            <span className="text-muted-foreground text-sm ml-1">batches need attention</span>
          </CardContent>
          {withSearchSyncIssues.length > 0 && (
            <CardContent className="pt-0 text-xs text-muted-foreground">
              Pending sync or sync_failed rows — see batch table column.
            </CardContent>
          )}
        </Card>
      </div>

      {/* Batch summary table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent ingestion batches</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {summaries.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">No batches yet. Create a feed or run an import.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 font-medium">Batch</th>
                    <th className="text-left p-3 font-medium">Source</th>
                    <th className="text-left p-3 font-medium">Supplier</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-right p-3 font-medium">Total</th>
                    <th className="text-right p-3 font-medium">Accepted</th>
                    <th className="text-right p-3 font-medium">Review</th>
                    <th className="text-right p-3 font-medium">Rejected</th>
                    <th className="text-right p-3 font-medium">Published</th>
                    <th className="text-right p-3 font-medium">Search sync</th>
                    <th className="text-left p-3 font-medium">Started</th>
                    <th className="text-left p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {summaries.map((s) => (
                    <tr key={s.id} className="border-b border-border hover:bg-muted/30">
                      <td className="p-3 font-mono text-xs">{s.id.slice(0, 8)}…</td>
                      <td className="p-3"><SourceBadge source_type={s.source_type} /></td>
                      <td className="p-3">{s.supplier_name ?? s.supplier_id.slice(0, 8)}</td>
                      <td className="p-3"><StatusBadge status={s.status} /></td>
                      <td className="p-3 text-right">{s.total_rows}</td>
                      <td className="p-3 text-right text-emerald-600">{s.accepted_rows}</td>
                      <td className="p-3 text-right text-amber-600">{s.review_required_rows}</td>
                      <td className="p-3 text-right text-muted-foreground">{s.rejected_rows}</td>
                      <td className="p-3 text-right">{s.published_rows}</td>
                      <td className="p-3 text-right">
                        {s.sync_failed_rows > 0 ? (
                          <Badge variant="destructive" className="text-xs">
                            {s.sync_failed_rows} failed
                          </Badge>
                        ) : null}
                        {s.pending_search_sync_rows > 0 ? (
                          <Badge variant="outline" className="text-xs border-amber-500 text-amber-700 dark:text-amber-400 ml-1">
                            {s.pending_search_sync_rows} pending
                          </Badge>
                        ) : null}
                        {s.sync_failed_rows === 0 && s.pending_search_sync_rows === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : null}
                      </td>
                      <td className="p-3 text-muted-foreground">{new Date(s.started_at).toLocaleString()}</td>
                      <td className="p-3">
                        <Link href={`/dashboard/ingestion/${s.id}`} className="text-primary hover:underline">View</Link>
                        <span className="mx-1">·</span>
                        <Link href={`/dashboard/review?batch_id=${s.id}`} className="text-primary hover:underline">Review</Link>
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
