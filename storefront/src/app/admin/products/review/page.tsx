import { computeProductsImportConnectionStatus } from "@/lib/admin/products-import-connection";
import { loadAdminProductsReviewPageData } from "@/lib/admin/review-page-load";
import { PageHeader, StatCard, StatGrid } from "@/components/admin";
import { adminAlertSurface } from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { isUnifiedReviewQueueEnabled } from "@/lib/unified-ingestion/config";
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
  const catalogosBaseUrl =
    process.env.NEXT_PUBLIC_CATALOGOS_URL?.trim().replace(/\/+$/, "") ||
    conn.catalogos_base_url?.replace(/\/+$/, "") ||
    "";
  const useUnifiedQueue = isUnifiedReviewQueueEnabled();

  const rawBatch = searchParams.batchId;
  const batchId =
    typeof rawBatch === "string" ? rawBatch.trim() : Array.isArray(rawBatch) ? (rawBatch[0] ?? "").trim() : "";

  const { unifiedRows, clipboardRows, categories, warnings, queueError } =
    await loadAdminProductsReviewPageData({ useUnifiedQueue });

  const needsReview = useUnifiedQueue
    ? unifiedRows.filter((r) => r.reviewStatus === "needs_review").length
    : clipboardRows.filter((r) => r.review_status === "needs_review").length;
  const promoted = useUnifiedQueue
    ? unifiedRows.filter((r) => r.reviewStatus === "promoted_to_draft").length
    : clipboardRows.filter((r) => r.review_status === "converted_to_draft").length;
  const dismissed = useUnifiedQueue
    ? unifiedRows.filter((r) => r.reviewStatus === "dismissed").length
    : clipboardRows.filter((r) => r.review_status === "dismissed").length;

  const optionalWarnings = warnings.filter((warning) => warning.area === "categories");
  const queueLabel = useUnifiedQueue ? "Unified ingestion queue" : "Clipboard staging queue";

  return (
    <div>
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

      <div className={cn(adminAlertSurface("info", "mb-6"))}>
        <strong className="text-admin-accent">Canonical publish</strong> — production go-live uses CatalogOS{" "}
        <span className="font-mono text-xs">runPublish</span> from review/publish. Storefront review queues are visibility
        and draft promotion only; they do not replace CatalogOS publish for variants, offers, images, attributes, or
        pricing.
        {catalogosBaseUrl ? (
          <span className="mt-2 block">
            <a href={`${catalogosBaseUrl}/dashboard/publish`} target="_blank" rel="noopener noreferrer" className="font-semibold text-admin-accent underline">
              Open CatalogOS publish
            </a>
          </span>
        ) : null}
      </div>

      {queueError ? (
        <div className={cn(adminAlertSurface("critical", "mb-6"))}>
          <strong className="text-admin-danger">{queueLabel} unavailable.</strong>{" "}
          <span className="text-admin-secondary">{queueError.message}</span>
          <div className="mt-2 font-mono text-xs text-admin-muted">
            area={queueError.area} code={queueError.code}
          </div>
        </div>
      ) : null}

      {optionalWarnings.map((warning) => (
        <div key={`${warning.area}-${warning.code}`} className={cn(adminAlertSurface("warning", "mb-6"))}>
          <strong className="text-admin-warning">Category list unavailable.</strong>{" "}
          <span className="text-admin-secondary">{warning.message}</span>
          <div className="mt-2 font-mono text-xs text-admin-muted">
            area={warning.area} code={warning.code}
          </div>
        </div>
      ))}

      {useUnifiedQueue ? (
        <div className={cn(adminAlertSurface("info", "mb-6"))}>
          <strong className="text-admin-accent">Unified ingestion queue</strong> — Quick Draft and Deep Supplier Crawl rows from{" "}
          <span className="font-mono text-xs">catalog_v2.catalog_staging_*</span>. Promoting creates a draft only.
          {catalogOsOffline ? (
            <span className="mt-2 block text-admin-warning">
              Catalog sync is offline; new Deep crawls need CatalogOS, but staged rows below still load.
            </span>
          ) : null}
        </div>
      ) : catalogOsOffline ? (
        <div className={cn(adminAlertSurface("warning", "mb-6"))}>
          <strong className="font-semibold">Catalog sync is offline or misconfigured.</strong>{" "}
          <span>{conn.message}</span> Legacy clipboard staging loads when Supabase is configured.
        </div>
      ) : (
        <div className={cn(adminAlertSurface("info", "mb-6"))}>
          <strong className="text-admin-primary">Legacy clipboard queue</strong> — set{" "}
          <span className="font-mono text-xs">UNIFIED_REVIEW_QUEUE=1</span> for unified staging.
        </div>
      )}

      {batchId && useUnifiedQueue ? (
        <div className={cn(adminAlertSurface("info", "mb-6"))}>
          <strong className="text-admin-accent">CatalogOS URL import batch</strong>
          <span className="font-mono text-xs"> {batchId}</span>
          <p className="mt-2 leading-relaxed text-admin-secondary">
            This URL import should be reviewed and published in CatalogOS. Storefront review queue is visibility only —
            use CatalogOS review, wizard, and publish guards for canonical publish.
          </p>
        </div>
      ) : null}

      <ProductReviewQueueClient
        useUnifiedQueue={useUnifiedQueue}
        unifiedRows={unifiedRows}
        clipboardRows={clipboardRows}
        categories={categories}
        supabaseConfigured={isSupabaseConfigured()}
        catalogosBaseUrl={catalogosBaseUrl}
        batchId={batchId}
      />
    </div>
  );
}
