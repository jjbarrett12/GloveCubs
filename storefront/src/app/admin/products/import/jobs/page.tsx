import { catalogosInternalRequest } from "@/lib/admin/catalogos-internal-client";
import { computeProductsImportConnectionStatus } from "@/lib/admin/products-import-connection";
import { adaptUrlImportJobList } from "@/lib/admin/url-import-adapter";
import { PageHeader, StatCard, StatGrid, StatusBadge } from "@/components/admin";
import { adminAlertSurface, adminLink } from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";
import { UrlJobsPanel } from "../_components/UrlJobsPanel";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Import activity | GloveCubs admin",
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
    <div>
      <PageHeader
        title="Import activity"
        description="Open a run to inspect extracted lines before anything is published."
        breadcrumb={[
          { label: "Products", href: "/admin/products" },
          { label: "Import", href: "/admin/products/import" },
          { label: "Activity" },
        ]}
        actions={<StatusBadge status={connectionVariant(conn.status)} size="md" dot />}
      />

      <div className="mb-6 text-sm">
        <Link href="/admin/products/import/url" className={adminLink}>
          ← Back to URL import
        </Link>
      </div>

      {offline ? (
        <div className={cn(adminAlertSurface("critical", "mb-6"))}>
          <strong className="font-semibold">Catalog sync offline.</strong> <span>{conn.message}</span>
        </div>
      ) : null}

      <StatGrid columns={3} className="mb-8 gap-4">
        <StatCard
          label="Running / queued"
          value={runningCount}
          color={runningCount > 0 ? "blue" : "default"}
          accentBorder
        />
        <StatCard label="Completed" value={completedCount} color="green" accentBorder />
        <StatCard
          label="Failed"
          value={failedCount}
          color={failedCount > 0 ? "red" : "default"}
          accentBorder
        />
      </StatGrid>

      <UrlJobsPanel initialJobs={jobs} initialError={error} offline={offline} />
    </div>
  );
}
