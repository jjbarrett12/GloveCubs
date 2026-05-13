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
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 pb-10 shadow-sm sm:p-8">
      <PageHeader
        title="Product import"
        description="Run CatalogOS crawls, stage clipboard URLs for review, or export the catalog grid. Publishing stays a guarded database step."
        actions={<StatusBadge status={connectionVariant(conn.status)} size="md" dot />}
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Link
          href="/admin/products/import/url"
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-[#f06232]/35 hover:shadow-md"
        >
          <div className="text-sm font-semibold text-slate-900">Import from URL</div>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">Stage, review, then publish; CatalogOS crawl when online.</p>
        </Link>
        <Link
          href="/admin/products/import/jobs"
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-[#f06232]/35 hover:shadow-md"
        >
          <div className="text-sm font-semibold text-slate-900">Import jobs</div>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">Monitor queued, running, and completed crawls.</p>
        </Link>
        <Link
          href="/admin/products/import/csv"
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-[#f06232]/35 hover:shadow-md"
        >
          <div className="text-sm font-semibold text-slate-900">CSV import (roadmap)</div>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">Feed mapper not in storefront yet—export grid CSV from Products today.</p>
        </Link>
      </div>

      {offline ? (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <strong className="font-semibold">Ingestion offline — configure CatalogOS connection.</strong>{" "}
          <span>{conn.message}</span>
        </div>
      ) : null}

      <StatGrid columns={4} className="mb-8 gap-4">
        <StatCard
          label="CatalogOS"
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

      <div className="mb-8 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
        <strong className="text-slate-900">Storefront admin does not write canonical products directly.</strong>{" "}
        CatalogOS owns extraction, matching, staging, and publish. This page only orchestrates operator actions.
      </div>

      <div className="mb-6">
        <UrlImportPanel offline={offline} offlineMessage={conn.message} />
      </div>

      <div className="mb-6">
        <UrlJobsPanel initialJobs={jobs} initialError={error} offline={offline} />
      </div>

      <section aria-label="Coming next" className="mb-8 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-5">
          <h3 className="text-sm font-semibold text-slate-900">CSV / spreadsheet import</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Upload feeds, map columns, and preview standardized rows before staging. Handled in CatalogOS ingestion pipelines.
          </p>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Roadmap</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-5">
          <h3 className="text-sm font-semibold text-slate-900">Publish from review queue</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Operator review and guarded publish into canonical catalog. CatalogOS publish-service rules apply.
          </p>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Roadmap</p>
        </div>
      </section>

      <p className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
        <ImportStatusBadge status="completed" /> indicates CatalogOS finished a crawl. Bridge sends selected rows to CatalogOS for upstream
        review. The storefront <strong className="text-slate-800">Review queue</strong> lists <strong className="text-slate-800">clipboard URL staging</strong> in Supabase—not CatalogOS batch rows. Storefront never writes canonical products.
      </p>
    </div>
  );
}
