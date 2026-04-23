import Link from "next/link";
import { notFound } from "next/navigation";
import { getSyncRunById, listSyncItemResults, listDiscontinuedCandidates } from "@/lib/catalog-expansion/sync-runs";
import { listSuppliers } from "@/lib/catalogos/suppliers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SyncRunActions } from "./SyncRunActions";
import { ReRunSyncButton } from "./ReRunSyncButton";

type PageProps = { params: Promise<{ id: string }> };

export default async function CatalogExpansionRunDetailPage({ params }: PageProps) {
  const { id } = await params;
  let run: Awaited<ReturnType<typeof getSyncRunById>>;
  let items: Awaited<ReturnType<typeof listSyncItemResults>>;
  let discontinued: Awaited<ReturnType<typeof listDiscontinuedCandidates>>;
  let suppliers: Awaited<ReturnType<typeof listSuppliers>>;
  try {
    [run, items, discontinued, suppliers] = await Promise.all([
      getSyncRunById(id),
      listSyncItemResults(id),
      listDiscontinuedCandidates(id),
      listSuppliers(true),
    ]);
  } catch (e) {
    notFound();
  }
  if (!run) notFound();

  const stats = (run.stats as { new_count?: number; changed_count?: number; unchanged_count?: number; missing_count?: number }) ?? {};
  const supplierNames = new Map(suppliers.map((s) => [s.id, s.name]));

  const byType = {
    new: items.filter((i) => i.result_type === "new"),
    changed: items.filter((i) => i.result_type === "changed"),
    unchanged: items.filter((i) => i.result_type === "unchanged"),
    missing: items.filter((i) => i.result_type === "missing"),
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-between gap-4">
          <Link href="/dashboard/catalog-expansion" className="text-sm text-muted-foreground hover:text-foreground">
            ← Sync runs
          </Link>
          <ReRunSyncButton feedId={run.feed_id} />
        </div>
      </div>
      <h1 className="text-2xl font-bold tracking-tight">Sync run {run.id.slice(0, 8)}…</h1>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>
            <span className="text-muted-foreground">Supplier:</span> {supplierNames.get(run.supplier_id) ?? run.supplier_id}
          </p>
          <p>
            <span className="text-muted-foreground">Status:</span>{" "}
            <Badge variant={run.status === "completed" ? "default" : run.status === "failed" ? "destructive" : "secondary"}>
              {run.status}
            </Badge>
          </p>
          <p>
            <span className="text-muted-foreground">New:</span> {stats.new_count ?? 0} ·{" "}
            <span className="text-muted-foreground">Changed:</span> {stats.changed_count ?? 0} ·{" "}
            <span className="text-muted-foreground">Unchanged:</span> {stats.unchanged_count ?? 0} ·{" "}
            <span className="text-muted-foreground">Missing:</span> {stats.missing_count ?? 0}
          </p>
          <p>
            <span className="text-muted-foreground">Started:</span> {new Date(run.started_at).toLocaleString()}
          </p>
          {run.completed_at && (
            <p>
              <span className="text-muted-foreground">Completed:</span> {new Date(run.completed_at).toLocaleString()}
            </p>
          )}
          {run.error_message && (
            <p className="text-destructive">
              <span className="text-muted-foreground">Error:</span> {run.error_message}
            </p>
          )}
        </CardContent>
      </Card>

      {byType.changed.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Changed items ({byType.changed.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border max-h-80 overflow-y-auto">
              {byType.changed.map((i) => (
                <li key={i.id} className="px-4 py-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-sm truncate">{i.external_id}</p>
                    <p className="text-xs text-muted-foreground">
                      {typeof i.change_summary === "object" && i.change_summary !== null
                        ? Object.entries(i.change_summary)
                            .filter(([, v]) => v != null)
                            .map(([k, v]) => `${k}: ${String(v)}`)
                            .join(" · ")
                        : "—"}
                    </p>
                  </div>
                  <SyncRunActions
                  itemResultId={i.id}
                  resolvedAt={i.resolved_at}
                  resolution={i.resolution}
                  resultType={i.result_type}
                  promotionStatus={i.promotion_status}
                  promotedNormalizedId={i.promoted_normalized_id}
                  lifecycleStatus={i.lifecycle_status}
                  supersededBySyncItemResultId={i.superseded_by_sync_item_result_id}
                />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {byType.new.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">New items ({byType.new.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border max-h-60 overflow-y-auto">
              {byType.new.slice(0, 50).map((i) => (
                <li key={i.id} className="px-4 py-2 flex items-center justify-between gap-2">
                  <span className="font-mono text-sm">{i.external_id}</span>
                  <SyncRunActions
                    itemResultId={i.id}
                    resolvedAt={i.resolved_at}
                    resolution={i.resolution}
                    resultType={i.result_type}
                    promotionStatus={i.promotion_status}
                    promotedNormalizedId={i.promoted_normalized_id}
                    lifecycleStatus={i.lifecycle_status}
                    supersededBySyncItemResultId={i.superseded_by_sync_item_result_id}
                  />
                </li>
              ))}
              {byType.new.length > 50 && (
                <li className="px-4 py-2 text-muted-foreground text-sm">+{byType.new.length - 50} more</li>
              )}
            </ul>
          </CardContent>
        </Card>
      )}

      {discontinued.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Discontinued candidates ({discontinued.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border max-h-80 overflow-y-auto">
              {discontinued.map((d) => (
                <li key={d.id} className="px-4 py-3 flex items-center justify-between gap-2">
                  <span className="font-mono text-sm">{d.external_id}</span>
                  <Badge variant={d.status === "pending_review" ? "secondary" : "outline"}>{d.status}</Badge>
                  <SyncRunActions
                    discontinuedId={d.id}
                    discontinuedStatus={d.status}
                    externalId={d.external_id}
                  />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {byType.missing.length > 0 && byType.missing.length !== discontinued.length && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Missing from feed ({byType.missing.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border max-h-60 overflow-y-auto">
              {byType.missing.slice(0, 30).map((i) => (
                <li key={i.id} className="px-4 py-2 font-mono text-sm">{i.external_id}</li>
              ))}
              {byType.missing.length > 30 && (
                <li className="px-4 py-2 text-muted-foreground text-sm">+{byType.missing.length - 30} more</li>
              )}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
