import { catalogosInternalRequest } from "@/lib/admin/catalogos-internal-client";
import { computeProductsImportConnectionStatus } from "@/lib/admin/products-import-connection";
import {
  adaptUrlImportJobList,
  type UrlImportJobSummary,
} from "@/lib/admin/url-import-adapter";
import {
  PageHeader,
  StatCard,
  StatGrid,
  StatusBadge,
} from "@/components/admin";
import { ImportStatusBadge } from "./_components/ImportStatusBadge";
import { UrlImportPanel } from "./_components/UrlImportPanel";
import { UrlJobsPanel } from "./_components/UrlJobsPanel";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Product import | GloveCubs admin",
  robots: { index: false, follow: false },
};

async function loadInitialJobs(): Promise<{ jobs: UrlImportJobSummary[]; error: string | null }> {
  const res = await catalogosInternalRequest({
    method: "GET",
    path: "/api/admin/url-import?limit=50",
    maxAttempts: 2,
  });
  if (!res.ok) {
    return { jobs: [], error: res.error.message };
  }
  return { jobs: adaptUrlImportJobList(res.data), error: null };
}

function connectionVariant(status: "online" | "offline" | "misconfigured"): "success" | "error" | "warning" {
  if (status === "online") return "success";
  if (status === "misconfigured") return "warning";
  return "error";
}

export default async function AdminProductsImportPage() {
  const conn = computeProductsImportConnectionStatus();
  const offline = conn.status !== "online";
  const { jobs, error } = offline ? { jobs: [], error: null as string | null } : await loadInitialJobs();

  const runningCount = jobs.filter((j) => j.status === "running" || j.status === "queued").length;
  const completedCount = jobs.filter((j) => j.status === "completed").length;
  const failedCount = jobs.filter((j) => j.status === "failed").length;

  return (
    <div>
      <PageHeader
        title="Product Import Command Center"
        description="Load products through CatalogOS, review extracted rows, and stage them for the review queue. Publish remains a separate guarded step."
        actions={<StatusBadge status={connectionVariant(conn.status)} size="md" dot />}
      />

      {offline ? (
        <div className="mb-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          <strong className="font-semibold">Ingestion offline — configure CatalogOS connection.</strong>{" "}
          <span className="text-red-800">{conn.message}</span>
        </div>
      ) : null}

      <StatGrid columns={4} className="mb-6">
        <StatCard
          label="CatalogOS"
          value={conn.status === "online" ? "Online" : conn.status === "misconfigured" ? "Misconfigured" : "Offline"}
          color={conn.status === "online" ? "green" : conn.status === "misconfigured" ? "amber" : "red"}
          accentBorder
        />
        <StatCard label="Running / queued" value={runningCount} color={runningCount > 0 ? "blue" : "default"} accentBorder />
        <StatCard label="Completed" value={completedCount} color="green" accentBorder />
        <StatCard label="Failed" value={failedCount} color={failedCount > 0 ? "red" : "default"} accentBorder />
      </StatGrid>

      <div className="mb-6 rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
        <strong className="text-gray-900">Storefront admin does not write canonical products directly.</strong>{" "}
        CatalogOS owns extraction, matching, staging, and publish. This page only orchestrates operator actions.
      </div>

      <div className="mb-6">
        <UrlImportPanel offline={offline} offlineMessage={conn.message} />
      </div>

      <div className="mb-6">
        <UrlJobsPanel initialJobs={jobs} initialError={error} offline={offline} />
      </div>

      <section aria-label="Coming next" className="mb-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4 opacity-80">
          <h3 className="text-sm font-semibold text-gray-900">CSV / spreadsheet import</h3>
          <p className="mt-2 text-xs leading-relaxed text-gray-500">
            Upload feeds, map columns, and preview standardized rows before staging. Handled in CatalogOS ingestion pipelines.
          </p>
          <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-gray-400">Phase 3</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 opacity-80">
          <h3 className="text-sm font-semibold text-gray-900">Publish from review queue</h3>
          <p className="mt-2 text-xs leading-relaxed text-gray-500">
            Operator review and guarded publish into canonical catalog. CatalogOS publish-service rules apply.
          </p>
          <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-gray-400">Phase 4</p>
        </div>
      </section>

      <p className="flex items-center gap-2 text-xs text-gray-500">
        <ImportStatusBadge status="completed" /> indicates CatalogOS finished a crawl. Bridge selected rows from the
        job detail to send them to the CatalogOS review queue. Storefront never writes canonical products.
      </p>
    </div>
  );
}
