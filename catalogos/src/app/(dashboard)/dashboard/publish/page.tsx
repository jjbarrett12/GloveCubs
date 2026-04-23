import Link from "next/link";
import { getPublishReady } from "@/lib/review/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SearchPublishStatusBadge } from "@/components/review/SearchPublishStatusBadge";

export default async function PublishReadyPage() {
  let rows: Awaited<ReturnType<typeof getPublishReady>>;
  try {
    rows = await getPublishReady(100);
  } catch (e) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Publish-ready</h1>
        <p className="text-destructive">Failed to load.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Publish-ready</h1>
        <span className="text-sm text-muted-foreground">{rows.length} approved</span>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Approved staged products</CardTitle>
          <p className="text-sm text-muted-foreground">These have been approved and can be published to the live catalog.</p>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <p className="font-medium">No publish-ready items.</p>
              <p className="text-sm mt-1">Approve staged products in the Review queue to see them here.</p>
              <Link href="/dashboard/review" className="inline-block mt-4">
                <Button size="sm">Go to Review queue</Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left p-3 font-medium">Supplier</th>
                    <th className="text-left p-3 font-medium">SKU</th>
                    <th className="text-left p-3 font-medium">Name</th>
                    <th className="text-left p-3 font-medium">Master</th>
                    <th className="text-left p-3 font-medium">Cost</th>
                    <th className="text-left p-3 font-medium">Storefront sync</th>
                    <th className="text-left p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-border hover:bg-muted/30">
                      <td className="p-3 max-w-[120px] truncate">{r.supplier_name ?? "—"}</td>
                      <td className="p-3 font-mono text-xs">{(r.normalized_data as { sku?: string })?.sku ?? "—"}</td>
                      <td className="p-3 max-w-[200px] truncate">{(r.normalized_data as { name?: string })?.name ?? "—"}</td>
                      <td className="p-3 max-w-[120px] truncate text-muted-foreground">{r.master_sku ?? r.master_name ?? "—"}</td>
                      <td className="p-3 tabular-nums">{(r.normalized_data as { cost?: number })?.cost != null ? `$${Number((r.normalized_data as { cost?: number }).cost).toFixed(2)}` : "—"}</td>
                      <td className="p-3">
                        <SearchPublishStatusBadge status={r.search_publish_status} />
                      </td>
                      <td className="p-3">
                        <Link href={`/dashboard/review?id=${r.id}`} className="text-primary hover:underline text-xs">Review</Link>
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
