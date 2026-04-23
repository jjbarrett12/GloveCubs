import { Suspense } from "react";
import { getStagingRows, getSuppliersForFilter, getCategoriesForFilter } from "@/lib/review/data";
import { ReviewPageClient } from "@/components/review/ReviewPageClient";
import { Skeleton } from "@/components/ui/skeleton";

export default async function ReviewQueuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const supplier_id = typeof params.supplier_id === "string" ? params.supplier_id : undefined;
  const batch_id = typeof params.batch_id === "string" ? params.batch_id : undefined;
  const status = typeof params.status === "string" ? params.status : undefined;
  const category_id = typeof params.category_id === "string" ? params.category_id : undefined;
  const unmatched = params.unmatched === "1" || params.unmatched === "true";
  const anomalies = params.anomalies === "1" || params.anomalies === "true";
  const missingAttrs = params.missing_attributes === "1" || params.missing_attributes === "true";
  const conf_min = typeof params.conf_min === "string" ? parseFloat(params.conf_min) : undefined;
  const conf_max = typeof params.conf_max === "string" ? parseFloat(params.conf_max) : undefined;
  const q = typeof params.q === "string" ? params.q.trim() : undefined;

  const filters = {
    supplier_id,
    batch_id,
    status,
    category_id,
    unmatched_only: unmatched,
    has_anomalies: anomalies,
    missing_attributes: missingAttrs,
    confidence_min: Number.isFinite(conf_min) ? conf_min : undefined,
    confidence_max: Number.isFinite(conf_max) ? conf_max : undefined,
    search: q || undefined,
    limit: q ? 200 : 100,
  };

  let rows: Awaited<ReturnType<typeof getStagingRows>>;
  let suppliers: Awaited<ReturnType<typeof getSuppliersForFilter>>;
  let categories: Awaited<ReturnType<typeof getCategoriesForFilter>>;
  try {
    [rows, suppliers, categories] = await Promise.all([
      getStagingRows(filters),
      getSuppliersForFilter(),
      getCategoriesForFilter(),
    ]);
  } catch (e) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Review queue</h1>
        <p className="text-destructive">Failed to load. Check schema.</p>
      </div>
    );
  }

  const approvedCount = rows.filter((r) => r.status === "approved" || r.status === "merged").length;
  const pendingCount = rows.filter((r) => r.status === "pending").length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Review queue</h1>
        <span className="text-sm text-muted-foreground">{rows.length} staged</span>
      </div>
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <ReviewPageClient
          rows={rows}
          suppliers={suppliers}
          categories={categories}
          batchId={batch_id ?? undefined}
          approvedCount={approvedCount}
          pendingCount={pendingCount}
        />
      </Suspense>
    </div>
  );
}
