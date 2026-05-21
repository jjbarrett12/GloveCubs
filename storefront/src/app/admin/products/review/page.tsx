import { computeProductsImportConnectionStatus } from "@/lib/admin/products-import-connection";
import { PageHeader, StatCard, StatGrid } from "@/components/admin";
import { listClipboardStaging, type ClipboardStagingRow } from "@/lib/admin/clipboard-url-staging";
import {
  listUnifiedReviewQueue,
  modeLabel,
  type UnifiedReviewQueueRow,
} from "@/lib/admin/unified-ingestion-review-queue";
import { fetchAdminCategoriesForProductForm, type AdminCategoryOption } from "@/lib/admin/product-form-options";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { isUnifiedReviewQueueEnabled } from "../../../../../../lib/unified-ingestion/config";
import { ProductReviewQueueClient } from "./_components/ProductReviewQueueClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Review & staging | GloveCubs admin",
  robots: { index: false, follow: false },
};

export default async function AdminProductsReviewPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const conn = computeProductsImportConnectionStatus();
  const catalogOsOffline = conn.status !== "online";
  const configured = isSupabaseConfigured();
  const useUnifiedQueue = isUnifiedReviewQueueEnabled();

  const rawBatch = searchParams.batchId;
  const batchId =
    typeof rawBatch === "string" ? rawBatch.trim() : Array.isArray(rawBatch) ? (rawBatch[0] ?? "").trim() : "";

  let unifiedRows: UnifiedReviewQueueRow[] = [];
  let clipboardRows: ClipboardStagingRow[] = [];
  let categories: AdminCategoryOption[] = [];

  if (configured) {
    if (useUnifiedQueue) {
      [unifiedRows, categories] = await Promise.all([
        listUnifiedReviewQueue({ limit: 200 }),
        fetchAdminCategoriesForProductForm(),
      ]);
    } else {
      [clipboardRows, categories] = await Promise.all([
        listClipboardStaging(200),
        fetchAdminCategoriesForProductForm(),
      ]);
    }
  }

  const needsReview = useUnifiedQueue
    ? unifiedRows.filter((r) => r.reviewStatus === "needs_review").length
    : clipboardRows.filter((r) => r.review_status === "needs_review").length;
  const promoted = useUnifiedQueue
    ? unifiedRows.filter((r) => r.reviewStatus === "promoted_to_draft").length
    : clipboardRows.filter((r) => r.review_status === "converted_to_draft").length;
  const dismissed = useUnifiedQueue
    ? unifiedRows.filter((r) => r.reviewStatus === "dismissed").length
    : clipboardRows.filter((r) => r.review_status === "dismissed").length;

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 pb-10 shadow-sm sm:p-8">
      <PageHeader
        title="Review & staging"
        description="Decide which staged ingest rows become catalog drafts. Dismiss anything that should not ship."
      />

      <StatGrid columns={4} className="mb-8 gap-4">
        <StatCard
          label="Catalog sync (remote crawls)"
          value={conn.status === "online" ? "Online" : conn.status === "misconfigured" ? "Misconfigured" : "Offline"}
          color={conn.status === "online" ? "green" : conn.status === "misconfigured" ? "amber" : "red"}
          accentBorder
        />
        <StatCard label="Awaiting decision" value={needsReview} color={needsReview > 0 ? "amber" : "default"} accentBorder />
        <StatCard label="Promoted to draft" value={promoted} color="green" accentBorder />
        <StatCard label="Dismissed" value={dismissed} color="default" accentBorder />
      </StatGrid>

      {useUnifiedQueue ? (
        <div className="mb-6 rounded-xl border border-[#f06232]/25 bg-[#fff7f2] px-4 py-4 text-sm text-slate-700">
          <strong className="text-[#c2410c]">Unified ingestion queue</strong> — Quick Draft and Deep Supplier Crawl rows from{" "}
          <span className="font-mono text-xs">catalog_v2.catalog_staging_*</span>. Promoting creates a draft only.
          {catalogOsOffline ? (
            <span className="mt-2 block text-amber-900">
              Catalog sync is offline; new Deep crawls need CatalogOS, but staged rows below still load.
            </span>
          ) : null}
        </div>
      ) : catalogOsOffline ? (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <strong className="font-semibold">Catalog sync is offline or misconfigured.</strong>{" "}
          <span>{conn.message}</span> Legacy clipboard staging loads when Supabase is configured.
        </div>
      ) : (
        <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
          <strong className="text-slate-900">Legacy clipboard queue</strong> — set{" "}
          <span className="font-mono text-xs">UNIFIED_REVIEW_QUEUE=1</span> for unified staging.
        </div>
      )}

      {batchId && useUnifiedQueue ? (
        <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
          <strong>batchId:</strong> <span className="font-mono text-xs">{batchId}</span>
        </div>
      ) : null}

      <ProductReviewQueueClient
        useUnifiedQueue={useUnifiedQueue}
        unifiedRows={unifiedRows}
        clipboardRows={clipboardRows}
        categories={categories}
        supabaseConfigured={configured}
        modeLabel={modeLabel}
      />
    </div>
  );
}