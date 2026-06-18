import Link from "next/link";
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
import {
  adminAlertSurface,
  adminCardSurface,
  adminLink,
  adminMutedPanel,
} from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";
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
        title="Product import"
        description="Bring in new items from supplier URLs, track import runs, or export your grid for offline work. Publishing always stays operator-controlled."
        actions={<StatusBadge status={connectionVariant(conn.status)} size="md" dot />}
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Link
          href="/admin/products/import/url"
          className={cn(adminCardSurface, "p-5 transition-colors hover:bg-admin-surface-muted hover:border-admin-accent/35")}
        >
          <div className="text-sm font-semibold text-admin-primary">Import from URL</div>
          <p className="mt-2 text-sm leading-relaxed text-admin-secondary">Paste links, stage rows for review, then promote to drafts when ready.</p>
        </Link>
        <Link
          href="/admin/products/import/jobs"
          className={cn(adminCardSurface, "p-5 transition-colors hover:bg-admin-surface-muted hover:border-admin-accent/35")}
        >
          <div className="text-sm font-semibold text-admin-primary">Import activity</div>
          <p className="mt-2 text-sm leading-relaxed text-admin-secondary">See queued, running, and finished import runs.</p>
        </Link>
        <Link
          href="/admin/products/import/csv"
          className={cn(adminCardSurface, "p-5 transition-colors hover:bg-admin-surface-muted hover:border-admin-accent/35")}
        >
          <div className="text-sm font-semibold text-admin-primary">CSV import (coming soon)</div>
          <p className="mt-2 text-sm leading-relaxed text-admin-secondary">Spreadsheet ingest is not in this console yet—export CSV from Products for now.</p>
        </Link>
      </div>

      {offline ? (
        <div className={cn(adminAlertSurface("critical", "mb-6"))}>
          <strong className="font-semibold">Catalog sync is offline.</strong>{" "}
          <span>{conn.message}</span>
        </div>
      ) : null}

      <StatGrid columns={4} className="mb-8 gap-4">
        <StatCard
          label="Catalog sync"
          value={conn.status === "online" ? "Online" : conn.status === "misconfigured" ? "Misconfigured" : "Offline"}
          color={conn.status === "online" ? "green" : conn.status === "misconfigured" ? "amber" : "red"}
          accentBorder
        />
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

      <div className={cn(adminMutedPanel, "mb-8 border-solid px-4 py-4 text-sm text-admin-secondary")}>
        <strong className="text-admin-primary">Imports are staged first.</strong>{" "}
        Heavy extraction and matching run in the catalog sync service; this console is where your team reviews, approves,
        and publishes.
      </div>

      <div className="mb-6">
        <UrlImportPanel offline={offline} offlineMessage={conn.message} />
      </div>

      <div className="mb-6">
        <UrlJobsPanel initialJobs={jobs} initialError={error} offline={offline} />
      </div>

      <section aria-label="Coming next" className="mb-8 grid gap-4 md:grid-cols-2">
        <div className={cn(adminMutedPanel, "border-solid p-5")}>
          <h3 className="text-sm font-semibold text-admin-primary">CSV / spreadsheet import</h3>
          <p className="mt-2 text-sm leading-relaxed text-admin-secondary">
            Upload feeds, map columns, and preview rows before they hit the catalog. Planned for a future release.
          </p>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-admin-muted">Coming soon</p>
        </div>
        <div className={cn(adminMutedPanel, "border-solid p-5")}>
          <h3 className="text-sm font-semibold text-admin-primary">Publish from review</h3>
          <p className="mt-2 text-sm leading-relaxed text-admin-secondary">
            Operator review with publish checks stays the gate for anything customer-facing.
          </p>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-admin-muted">In progress</p>
        </div>
      </section>

      <p className="flex flex-wrap items-center gap-2 text-sm text-admin-secondary">
        <ImportStatusBadge status="completed" /> marks a finished remote crawl. Use <strong className="text-admin-primary">Review &amp; staging</strong>{" "}
        for URL clipboard rows stored here; deep crawl batches open from each import run detail.
      </p>
    </div>
  );
}
