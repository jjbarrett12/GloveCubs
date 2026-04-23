import Link from "next/link";
import { getOpsQueueSummaryV2 } from "@/lib/operations/ops-queue-v2";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function OperationsCommandCenterPage() {
  let summary: Awaited<ReturnType<typeof getOpsQueueSummaryV2>>;
  try {
    summary = await getOpsQueueSummaryV2({ limitPerCategory: 20 });
  } catch (e) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Operations</h1>
        <p className="text-destructive">Failed to load. Ensure Supabase and migrations are configured.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Operations command center</h1>
      <p className="text-muted-foreground text-sm max-w-2xl">
        Work queue: pending sync promotions, promoted unreviewed, blocked items, discontinued, duplicates, failed runs. Stale by age (1d / 3d / 7d+).
      </p>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending sync promotions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.pendingSyncPromotionsCount}</div>
            <Link href="/dashboard/catalog-expansion" className="text-xs text-primary hover:underline">
              Sync runs →
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Promoted, unreviewed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.promotedButUnreviewedCount}</div>
            <Link href="/dashboard/review" className="text-xs text-primary hover:underline">
              Review queue →
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Blocked (missing attrs)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.stagedBlockedByMissingAttrsCount}</div>
            <Link href="/dashboard/review" className="text-xs text-primary hover:underline">
              Review →
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Discontinued pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.discontinuedPendingCount}</div>
            <Link href="/dashboard/catalog-expansion" className="text-xs text-primary hover:underline">
              Catalog expansion →
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Duplicate warnings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.duplicateWarningsCount}</div>
            <Link href="/dashboard/product-matching" className="text-xs text-primary hover:underline">
              Product matching →
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Stale sync items (by age)</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <span className="text-muted-foreground">1d: </span>
            <strong>{summary.staleSyncItems.within1d}</strong>
            <span className="text-muted-foreground ml-3">3d: </span>
            <strong>{summary.staleSyncItems.within3d}</strong>
            <span className="text-muted-foreground ml-3">7d+: </span>
            <strong>{summary.staleSyncItems.within7dPlus}</strong>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Stale staged (by age)</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <span className="text-muted-foreground">1d: </span>
            <strong>{summary.staleStaged.within1d}</strong>
            <span className="text-muted-foreground ml-3">3d: </span>
            <strong>{summary.staleStaged.within3d}</strong>
            <span className="text-muted-foreground ml-3">7d+: </span>
            <strong>{summary.staleStaged.within7dPlus}</strong>
          </CardContent>
        </Card>
      </div>

      {summary.pendingSyncPromotions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pending sync promotions (new/changed)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border max-h-64 overflow-y-auto">
              {summary.pendingSyncPromotions.map((s) => (
                <li key={s.id} className="px-4 py-2 flex items-center justify-between gap-2">
                  <span className="font-mono text-xs">{s.external_id}</span>
                  <Badge variant="secondary">{s.result_type}</Badge>
                  <Link href={`/dashboard/catalog-expansion/runs/${s.run_id}`} className="text-xs text-primary hover:underline shrink-0">
                    Run →
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {summary.promotedButUnreviewed.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Promoted but unreviewed</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border max-h-64 overflow-y-auto">
              {summary.promotedButUnreviewed.map((s) => (
                <li key={s.sync_item_id} className="px-4 py-2 flex items-center justify-between gap-2">
                  <span className="font-mono text-xs">{s.external_id}</span>
                  <Link href={`/dashboard/review?normalized_id=${s.normalized_id}`} className="text-xs text-primary hover:underline shrink-0">
                    Review →
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {summary.stagedBlockedSample.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Blocked by missing required attributes (sample)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border max-h-48 overflow-y-auto">
              {summary.stagedBlockedSample.map((s) => (
                <li key={s.id} className="px-4 py-2 flex items-center justify-between gap-2">
                  <span className="font-mono text-xs">{s.id.slice(0, 8)}…</span>
                  <Link href={`/dashboard/review?normalized_id=${s.normalized_id}`} className="text-xs text-primary hover:underline shrink-0">
                    Review →
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {summary.failedRuns.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Failed runs / feeds (priority)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border max-h-64 overflow-y-auto">
              {summary.failedRuns.map((r) => (
                <li key={`${r.type}-${r.id}`} className="px-4 py-2 flex items-center gap-2 flex-wrap">
                  <Badge variant="destructive">{r.type}</Badge>
                  <span className="font-mono text-xs">{r.id.slice(0, 8)}…</span>
                  {r.message && <span className="text-muted-foreground text-xs truncate max-w-[200px]">{r.message}</span>}
                  <span className="text-xs text-muted-foreground">{r.at ? new Date(r.at).toLocaleString() : ""}</span>
                  <Link
                    href={
                      r.type === "catalog_sync"
                        ? `/dashboard/catalog-expansion/runs/${r.id}`
                        : r.type === "product_match"
                          ? `/dashboard/product-matching/runs/${r.id}`
                          : `/dashboard/batches/${r.id}`
                    }
                    className="text-xs text-primary hover:underline shrink-0"
                  >
                    View →
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {summary.pendingSyncPromotionsCount === 0 &&
        summary.promotedButUnreviewedCount === 0 &&
        summary.stagedBlockedByMissingAttrsCount === 0 &&
        summary.discontinuedPendingCount === 0 &&
        summary.duplicateWarningsCount === 0 &&
        summary.failedRuns.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              No pending items. Run sync and matching to see backlog.
            </CardContent>
          </Card>
        )}
    </div>
  );
}
