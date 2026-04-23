import { listFeeds, listFeedsBySupplier, getFeedUrl } from "@/lib/catalogos/feeds";
import { listSuppliers } from "@/lib/catalogos/suppliers";
import { FeedCreateForm } from "./FeedCreateForm";
import { FeedRunImportButton } from "./FeedRunImportButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

type SearchParams = Promise<{ supplier_id?: string }>;

export default async function FeedsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const supplierId = params.supplier_id;

  let feeds: Awaited<ReturnType<typeof listFeeds>>;
  let suppliers: Awaited<ReturnType<typeof listSuppliers>>;
  try {
    [feeds, suppliers] = await Promise.all([
      supplierId ? listFeedsBySupplier(supplierId) : listFeeds(),
      listSuppliers(true),
    ]);
  } catch (e) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Supplier feeds</h1>
        <p className="text-destructive">Failed to load. Ensure catalogos schema and Supabase are configured.</p>
      </div>
    );
  }

  const supplierNames = new Map(suppliers.map((s) => [s.id, s.name]));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Supplier feeds</h1>
        <Link href="/dashboard/feeds" className="text-sm text-muted-foreground hover:text-foreground">
          {supplierId ? "All feeds" : "Filter by supplier"}
        </Link>
      </div>

      <Card className="max-w-md">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Add feed</CardTitle>
        </CardHeader>
        <CardContent>
          <FeedCreateForm suppliers={suppliers} defaultSupplierId={supplierId ?? undefined} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Feeds</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {feeds.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              No feeds yet. Create one above or select a supplier to filter.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {feeds.map((f) => {
                const url = getFeedUrl(f);
                return (
                  <li key={f.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="font-mono text-xs text-muted-foreground shrink-0">{f.id.slice(0, 8)}…</span>
                      <span>{supplierNames.get(f.supplier_id) ?? f.supplier_id}</span>
                      <Badge variant="secondary">{f.feed_type}</Badge>
                      {url && <span className="truncate text-muted-foreground text-sm max-w-[200px]">{url}</span>}
                      {!f.is_active && <Badge variant="secondary">inactive</Badge>}
                    </div>
                    <FeedRunImportButton feedId={f.id} disabled={!url} />
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
