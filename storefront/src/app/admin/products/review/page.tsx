import { computeProductsImportConnectionStatus } from "@/lib/admin/products-import-connection";
import { PageHeader, StatCard, StatGrid } from "@/components/admin";
import { listClipboardStaging, type ClipboardStagingRow } from "@/lib/admin/clipboard-url-staging";
import { fetchAdminCategoriesForProductForm, type AdminCategoryOption } from "@/lib/admin/product-form-options";
import { isSupabaseConfigured } from "@/lib/supabase/server";
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

  const rawBatch = searchParams.batchId;
  const batchId =
    typeof rawBatch === "string" ? rawBatch.trim() : Array.isArray(rawBatch) ? (rawBatch[0] ?? "").trim() : "";

  let rows: ClipboardStagingRow[] = [];
  let categories: AdminCategoryOption[] = [];
  if (configured) {
    [rows, categories] = await Promise.all([listClipboardStaging(200), fetchAdminCategoriesForProductForm()]);
  }

  const needsReview = rows.filter((r) => r.review_status === "needs_review").length;
  const converted = rows.filter((r) => r.review_status === "converted_to_draft").length;
  const dismissed = rows.filter((r) => r.review_status === "dismissed").length;

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 pb-10 shadow-sm sm:p-8">
      <PageHeader
        title="Review & staging"
        description="Decide which staged URL rows become catalog drafts. Dismiss anything that should not ship."
      />

      <StatGrid columns={4} className="mb-8 gap-4">
        <StatCard
          label="Catalog sync (remote crawls)"
          value={conn.status === "online" ? "Online" : conn.status === "misconfigured" ? "Misconfigured" : "Offline"}
          color={conn.status === "online" ? "green" : conn.status === "misconfigured" ? "amber" : "red"}
          accentBorder
        />
        <StatCard label="Awaiting decision" value={needsReview} color={needsReview > 0 ? "amber" : "default"} accentBorder />
        <StatCard label="Promoted to draft" value={converted} color="green" accentBorder />
        <StatCard label="Dismissed" value={dismissed} color="default" accentBorder />
      </StatGrid>

      {catalogOsOffline ? (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <strong className="font-semibold">Catalog sync is offline or misconfigured.</strong>{" "}
          <span>{conn.message}</span> Clipboard staging below still loads when Supabase is configured.
        </div>
      ) : (
        <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
          Remote crawls are available. This table is <strong className="text-slate-900">clipboard staging only</strong>—lines you paste
          and triage here before promoting to drafts.
        </div>
      )}

      {batchId ? (
        <div className="mb-6 rounded-xl border border-[#f06232]/25 bg-[#fff7f2] px-4 py-3 text-sm text-slate-800">
          <strong className="text-[#c2410c]">batchId in URL:</strong>{" "}
          <span className="font-mono text-xs text-slate-600">{batchId}</span> — Remote batch views are not listed here yet.
          Open the matching import run for batch follow-up; clipboard rows still appear in the table when present.
        </div>
      ) : null}

      <ProductReviewQueueClient rows={rows} categories={categories} supabaseConfigured={configured} />
    </div>
  );
}
