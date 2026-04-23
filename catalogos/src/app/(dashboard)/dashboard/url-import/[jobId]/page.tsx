import Link from "next/link";
import { notFound } from "next/navigation";
import { getUrlImportJobDetail } from "@/lib/url-import/admin-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UrlImportPreviewClient } from "./UrlImportPreviewClient";

export default async function UrlImportJobPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const detail = await getUrlImportJobDetail(jobId);
  if (!detail) notFound();

  const { job, pages, products, familyGroups } = detail;
  const failedPages = pages.filter((p) => p.status === "failed");
  const lowConfidence = products.filter((p) => p.confidence < 0.6);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">URL import preview</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {job.supplier_name} · {job.start_url}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/url-import">
            <Button variant="outline" size="sm">Back to URL import</Button>
          </Link>
          {job.import_batch_id ? (
            <Link href={`/dashboard/batches/${job.import_batch_id}`}>
              <Button size="sm">View batch</Button>
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Products extracted</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-semibold">{job.products_extracted}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Family groups</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-semibold">{job.family_groups_inferred}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Failed pages</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-semibold">{job.failed_pages_count}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Low confidence</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-semibold">{lowConfidence.length}</span>
          </CardContent>
        </Card>
      </div>

      {job.warnings && job.warnings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Warnings</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside text-sm text-muted-foreground">
              {job.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {familyGroups.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Grouped family candidates</CardTitle>
            <p className="text-xs text-muted-foreground">Size variants inferred; approve for import to create one family + variants.</p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {familyGroups.map((g) => (
                <li key={g.family_group_key} className="flex items-center gap-2 text-sm">
                  <Badge variant="outline">{g.inferred_base_sku}</Badge>
                  <span>{g.count} variants</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {failedPages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Failed pages</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {failedPages.slice(0, 10).map((p) => (
                <li key={p.id} className="truncate" title={p.url}>
                  {p.url} — {p.error_message ?? "failed"}
                </li>
              ))}
              {failedPages.length > 10 && <li>… and {failedPages.length - 10} more</li>}
            </ul>
          </CardContent>
        </Card>
      )}

      {!job.import_batch_id ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Import selection</CardTitle>
            <p className="text-xs text-muted-foreground">
              Uncheck rows to exclude them. Only checked products are sent to the ingestion pipeline.
            </p>
          </CardHeader>
          <CardContent>
            <UrlImportPreviewClient jobId={jobId} products={products} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
