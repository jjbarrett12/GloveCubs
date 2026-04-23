import Link from "next/link";
import { listSyncRuns } from "@/lib/catalog-expansion/sync-runs";
import { listFeeds, getFeedUrl } from "@/lib/catalogos/feeds";
import { listSuppliers } from "@/lib/catalogos/suppliers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RunSyncForm } from "./RunSyncForm";

export default async function CatalogExpansionPage() {
  let runs: Awaited<ReturnType<typeof listSyncRuns>> = [];
  let feeds: Awaited<ReturnType<typeof listFeeds>> = [];
  let suppliers: Awaited<ReturnType<typeof listSuppliers>> = [];
  try {
    [runs, feeds, suppliers] = await Promise.all([
      listSyncRuns({ limit: 50 }),
      listFeeds(),
      listSuppliers(true),
    ]);
  } catch (e) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Catalog expansion</h1>
        <p className="text-destructive">Failed to load. Ensure Supabase and migrations are configured.</p>
      </div>
    );
  }

  const supplierNames = new Map(suppliers.map((s) => [s.id, s.name]));
  const feedsWithUrl = feeds.filter((f) => getFeedUrl(f));

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Catalog expansion</h1>
      <p className="text-muted-foreground text-sm max-w-2xl">
        Compare supplier feeds to the last import: detect new, changed, and missing SKUs. Price and packaging changes require review.
      </p>

      <Card className="max-w-lg">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Run sync</CardTitle>
        </CardHeader>
        <CardContent>
          <RunSyncForm feeds={feedsWithUrl.map((f) => ({ id: f.id, supplier_id: f.supplier_id, label: `${supplierNames.get(f.supplier_id) ?? f.supplier_id} · ${f.feed_type}` }))} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Sync runs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {runs.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">No sync runs yet. Run a sync above.</div>
          ) : (
            <ul className="divide-y divide-border">
              {runs.map((r) => {
                const stats = (r.stats as { new_count?: number; changed_count?: number; missing_count?: number }) ?? {};
                return (
                  <li key={r.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-muted-foreground">{r.id.slice(0, 8)}…</span>
                      <span>{supplierNames.get(r.supplier_id) ?? r.supplier_id.slice(0, 8)}</span>
                      <Badge variant={r.status === "completed" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>
                        {r.status}
                      </Badge>
                      {r.status === "completed" && (
                        <span className="text-muted-foreground text-sm">
                          new: {stats.new_count ?? 0} · changed: {stats.changed_count ?? 0} · missing: {stats.missing_count ?? 0}
                        </span>
                      )}
                      <span className="text-muted-foreground text-xs">{new Date(r.started_at).toLocaleString()}</span>
                    </div>
                    <Link href={`/dashboard/catalog-expansion/runs/${r.id}`} className="text-sm text-primary hover:underline shrink-0">
                      Details
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
