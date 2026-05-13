import { catalogosInternalRequest } from "@/lib/admin/catalogos-internal-client";
import { computeProductsImportConnectionStatus } from "@/lib/admin/products-import-connection";
import { adaptUrlImportJobList } from "@/lib/admin/url-import-adapter";
import { PageHeader, StatCard, StatGrid, StatusBadge } from "@/components/admin";
import { UrlJobsPanel } from "../_components/UrlJobsPanel";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "URL import jobs | GloveCubs admin",
  robots: { index: false, follow: false },
};

function connectionVariant(status: "online" | "offline" | "misconfigured"): "success" | "error" | "warning" {
  if (status === "online") return "success";
  if (status === "misconfigured") return "warning";
  return "error";
}

async function loadInitialJobs(): Promise<{ jobs: ReturnType<typeof adaptUrlImportJobList>; error: string | null }> {
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

export default async function AdminProductsImportJobsPage() {
  const conn = computeProductsImportConnectionStatus();
  const offline = conn.status !== "online";
  const { jobs, error } = offline ? { jobs: [], error: null as string | null } : await loadInitialJobs();

  const runningCount = jobs.filter((j) => j.status === "running" || j.status === "queued").length;
  const completedCount = jobs.filter((j) => j.status === "completed").length;
  const failedCount = jobs.filter((j) => j.status === "failed").length;

  return (
    <div className="rounded-xl border border-white/10 bg-[#0e0e0e] p-4 pb-8 shadow-md ring-1 ring-black/30 sm:p-5">
      <PageHeader
        variant="dark"
        title="URL import jobs"
        description="CatalogOS-backed crawl jobs. Open a row to review extracted evidence before any publish step."
        breadcrumb={[
          { label: "Products", href: "/admin/products" },
          { label: "Import", href: "/admin/products/import" },
          { label: "Jobs" },
        ]}
        actions={<StatusBadge status={connectionVariant(conn.status)} size="md" dot />}
      />

      <div className="mb-4 text-sm">
        <Link href="/admin/products/import/url" className="font-medium text-[#f06232] hover:text-[#ff8a5c] hover:underline">
          ← Back to URL import
        </Link>
      </div>

      {offline ? (
        <div className="mb-6 rounded-lg border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          <strong className="font-semibold text-red-50">Ingestion offline.</strong> <span className="text-red-200/90">{conn.message}</span>
        </div>
      ) : null}

      <StatGrid columns={3} className="mb-6">
        <StatCard
          label="Running / queued"
          value={runningCount}
          color={runningCount > 0 ? "blue" : "default"}
          accentBorder
          variant="dark"
        />
        <StatCard label="Completed" value={completedCount} color="green" accentBorder variant="dark" />
        <StatCard
          label="Failed"
          value={failedCount}
          color={failedCount > 0 ? "red" : "default"}
          accentBorder
          variant="dark"
        />
      </StatGrid>

      <UrlJobsPanel initialJobs={jobs} initialError={error} offline={offline} />
    </div>
  );
}
