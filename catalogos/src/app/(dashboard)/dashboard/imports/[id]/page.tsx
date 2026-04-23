import Link from "next/link";
import { notFound } from "next/navigation";
import { getBatchById } from "@/lib/review/data";
import {
  getRawRowsByBatch,
  getNormalizedRowsByBatch,
  getFailedRawRowsByBatch,
  getWarningsByBatch,
  getOffersCreatedByBatch,
} from "@/lib/ingestion/import-monitoring-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Params = Promise<{ id: string }>;

export default async function ImportBatchDetailPage({ params }: { params: Params }) {
  const id = (await params).id;
  const batch = await getBatchById(id);
  if (!batch) notFound();

  const [rawRows, normalizedRows, failedRows, warnings, offers] = await Promise.all([
    getRawRowsByBatch(id),
    getNormalizedRowsByBatch(id),
    getFailedRawRowsByBatch(id),
    getWarningsByBatch(id),
    getOffersCreatedByBatch(id),
  ]);

  const supplierName = (batch.supplier as { name?: string })?.name ?? "—";
  const status = String(batch.status);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/imports" className="text-muted-foreground hover:text-foreground text-sm">
          ← Import monitoring
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Batch {id.slice(0, 8)}…</h1>
        <Badge variant={status === "completed" ? "default" : status === "failed" ? "destructive" : "secondary"}>
          {status}
        </Badge>
      </div>

      <div className="flex gap-4 flex-wrap">
        <Card className="min-w-[140px]">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Supplier</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">{supplierName}</CardContent>
        </Card>
        <Card className="min-w-[100px]">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Raw rows</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{rawRows.length + failedRows.length}</CardContent>
        </Card>
        <Card className="min-w-[100px]">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Normalized</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-emerald-600">{normalizedRows.length}</CardContent>
        </Card>
        <Card className="min-w-[100px]">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Failed</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-red-600">{failedRows.length}</CardContent>
        </Card>
        <Card className="min-w-[100px]">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Warnings</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{warnings.length}</CardContent>
        </Card>
        <Card className="min-w-[100px]">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Offers created</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{offers.length}</CardContent>
        </Card>
      </div>

      <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Raw rows</CardTitle>
              <p className="text-sm text-muted-foreground">Immutable raw payloads from the feed.</p>
            </CardHeader>
            <CardContent className="p-0">
              {rawRows.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">No raw rows.</div>
              ) : (
                <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/90">
                      <tr className="border-b border-border">
                        <th className="text-left p-2 font-medium">ID</th>
                        <th className="text-left p-2 font-medium">External ID</th>
                        <th className="text-left p-2 font-medium">Payload (preview)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rawRows.map((r) => (
                        <tr key={r.id} className="border-b border-border hover:bg-muted/30">
                          <td className="p-2 font-mono text-xs">{r.id.slice(0, 8)}…</td>
                          <td className="p-2 font-mono text-xs">{r.external_id}</td>
                          <td className="p-2 max-w-[400px] truncate text-muted-foreground" title={JSON.stringify(r.raw_payload)}>
                            {JSON.stringify(r.raw_payload).slice(0, 120)}…
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

      <Card className="mt-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Normalized rows</CardTitle>
              <p className="text-sm text-muted-foreground">Staged products (supplier_products_normalized).</p>
            </CardHeader>
            <CardContent className="p-0">
              {normalizedRows.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">No normalized rows.</div>
              ) : (
                <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/90">
                      <tr className="border-b border-border">
                        <th className="text-left p-2 font-medium">SKU</th>
                        <th className="text-left p-2 font-medium">Name</th>
                        <th className="text-left p-2 font-medium">Status</th>
                        <th className="text-left p-2 font-medium">Match %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {normalizedRows.map((r) => (
                        <tr key={r.id} className="border-b border-border hover:bg-muted/30">
                          <td className="p-2 font-mono text-xs">{(r.normalized_data as { sku?: string })?.sku ?? "—"}</td>
                          <td className="p-2 max-w-[200px] truncate">{(r.normalized_data as { name?: string })?.name ?? "—"}</td>
                          <td className="p-2"><Badge variant="secondary">{r.status}</Badge></td>
                          <td className="p-2 tabular-nums">{r.match_confidence != null ? `${(r.match_confidence * 100).toFixed(0)}%` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

      <Card className="mt-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Failed rows</CardTitle>
              <p className="text-sm text-muted-foreground">Raw rows that did not produce a normalized row.</p>
            </CardHeader>
            <CardContent className="p-0">
              {failedRows.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">No failed rows.</div>
              ) : (
                <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/90">
                      <tr className="border-b border-border">
                        <th className="text-left p-2 font-medium">ID</th>
                        <th className="text-left p-2 font-medium">External ID</th>
                        <th className="text-left p-2 font-medium">Payload (preview)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {failedRows.map((r) => (
                        <tr key={r.id} className="border-b border-border hover:bg-muted/30">
                          <td className="p-2 font-mono text-xs">{r.id.slice(0, 8)}…</td>
                          <td className="p-2 font-mono text-xs">{r.external_id}</td>
                          <td className="p-2 max-w-[400px] truncate text-muted-foreground" title={JSON.stringify(r.raw_payload)}>
                            {JSON.stringify(r.raw_payload).slice(0, 120)}…
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

      <Card className="mt-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Warnings</CardTitle>
              <p className="text-sm text-muted-foreground">Anomaly flags on normalized rows.</p>
            </CardHeader>
            <CardContent className="p-0">
              {warnings.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">No warnings.</div>
              ) : (
                <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/90">
                      <tr className="border-b border-border">
                        <th className="text-left p-2 font-medium">SKU</th>
                        <th className="text-left p-2 font-medium">Name</th>
                        <th className="text-left p-2 font-medium">Messages</th>
                      </tr>
                    </thead>
                    <tbody>
                      {warnings.map((w, i) => (
                        <tr key={`${w.normalized_id}-${i}`} className="border-b border-border hover:bg-muted/30">
                          <td className="p-2 font-mono text-xs">{w.sku}</td>
                          <td className="p-2 max-w-[200px] truncate">{w.name}</td>
                          <td className="p-2 text-muted-foreground">
                            <ul className="list-disc list-inside">
                              {w.messages.map((m, j) => (
                                <li key={j}>{m}</li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

      <Card className="mt-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Created supplier offers</CardTitle>
              <p className="text-sm text-muted-foreground">Offers linked to this batch via normalized_id.</p>
            </CardHeader>
            <CardContent className="p-0">
              {offers.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">No offers created from this batch.</div>
              ) : (
                <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/90">
                      <tr className="border-b border-border">
                        <th className="text-left p-2 font-medium">Supplier SKU</th>
                        <th className="text-left p-2 font-medium">Product</th>
                        <th className="text-right p-2 font-medium">Cost</th>
                        <th className="text-left p-2 font-medium">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {offers.map((o) => (
                        <tr key={o.id} className="border-b border-border hover:bg-muted/30">
                          <td className="p-2 font-mono text-xs">{o.supplier_sku}</td>
                          <td className="p-2">{o.product_name ?? o.product_sku ?? o.product_id}</td>
                          <td className="p-2 text-right tabular-nums">${Number(o.cost).toFixed(2)}</td>
                          <td className="p-2 text-muted-foreground">{new Date(o.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

      <div className="flex gap-2 mt-6">
        <Link href={`/dashboard/review?batch_id=${id}`}>
          <span className="text-sm text-primary hover:underline">Open in Review queue</span>
        </Link>
        <span className="text-muted-foreground">·</span>
        <Link href={`/dashboard/batches/${id}`}>
          <span className="text-sm text-primary hover:underline">Batch detail (legacy)</span>
        </Link>
      </div>
    </div>
  );
}
