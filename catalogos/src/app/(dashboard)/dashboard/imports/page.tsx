import Link from "next/link";
import { getBatchesForMonitoring } from "@/lib/ingestion/import-monitoring-data";
import { getSuppliersForFilter } from "@/lib/review/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ImportMonitoringFilters } from "./ImportMonitoringFilters";

type SearchParams = Promise<{
  supplier_id?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
}>;

function StatusBadge({ status }: { status: string }) {
  const v =
    status === "completed" ? "success" : status === "failed" ? "destructive" : "secondary";
  return <Badge variant={v}>{status}</Badge>;
}

export default async function ImportMonitoringPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const filters = {
    supplier_id: params.supplier_id ?? undefined,
    status: params.status ?? undefined,
    date_from: params.date_from ?? undefined,
    date_to: params.date_to ?? undefined,
  };

  let batches: Awaited<ReturnType<typeof getBatchesForMonitoring>>;
  let suppliers: Awaited<ReturnType<typeof getSuppliersForFilter>>;
  try {
    [batches, suppliers] = await Promise.all([
      getBatchesForMonitoring(filters, 100),
      getSuppliersForFilter(),
    ]);
  } catch (e) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Import monitoring</h1>
        <p className="text-destructive">Failed to load. Check schema and connection.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Import monitoring</h1>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <ImportMonitoringFilters suppliers={suppliers} current={filters} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent import batches</CardTitle>
          <p className="text-sm text-muted-foreground">
            {batches.length} batch(es). Click a row to see raw rows, normalized rows, failed rows, warnings, and offers.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {batches.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No batches match the filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left p-3 font-medium">Batch</th>
                    <th className="text-left p-3 font-medium">Supplier</th>
                    <th className="text-right p-3 font-medium">Total rows</th>
                    <th className="text-right p-3 font-medium">Succeeded</th>
                    <th className="text-right p-3 font-medium">Failed</th>
                    <th className="text-right p-3 font-medium">Duplicates skipped</th>
                    <th className="text-right p-3 font-medium">Offers created</th>
                    <th className="text-left p-3 font-medium">Warnings</th>
                    <th className="text-left p-3 font-medium">Started</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b) => (
                    <tr key={b.id} className="border-b border-border hover:bg-muted/30">
                      <td className="p-3 font-mono text-xs">{b.id.slice(0, 8)}…</td>
                      <td className="p-3">{b.supplier_name}</td>
                      <td className="p-3 text-right tabular-nums">{b.total_rows}</td>
                      <td className="p-3 text-right tabular-nums text-emerald-600">{b.succeeded}</td>
                      <td className="p-3 text-right tabular-nums text-red-600">{b.failed}</td>
                      <td className="p-3 text-right tabular-nums">{b.duplicates_skipped}</td>
                      <td className="p-3 text-right tabular-nums">{b.offers_created}</td>
                      <td className="p-3 max-w-[180px] truncate text-muted-foreground" title={b.warnings_summary}>
                        {b.warnings_summary}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {new Date(b.started_at).toLocaleString()}
                      </td>
                      <td className="p-3">
                        <StatusBadge status={b.status} />
                      </td>
                      <td className="p-3">
                        <Link
                          href={`/dashboard/imports/${b.id}`}
                          className="text-primary hover:underline"
                        >
                          View
                        </Link>
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
