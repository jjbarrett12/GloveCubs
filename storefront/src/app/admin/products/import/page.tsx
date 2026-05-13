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
    <div className="rounded-xl border border-white/10 bg-[#0e0e0e] p-4 pb-8 shadow-md ring-1 ring-black/30 sm:p-5">
      <PageHeader
        variant="dark"
        title="Product Import Command Center"
        description="Load products through CatalogOS crawls, stage clipboard URLs for review, or export the catalog grid. Publish stays a guarded database step."
        actions={<StatusBadge status={connectionVariant(conn.status)} size="md" dot />}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Link
          href="/admin/products/import/url"
          className="rounded-lg border border-white/10 bg-[#161616] p-4 shadow-sm ring-1 ring-white/[0.03] transition hover:border-[#f06232]/40 hover:ring-[#f06232]/15"
        >
          <div className="text-sm font-semibold text-white">Import from URL</div>
          <p className="mt-1 text-xs text-neutral-500">Stage → review → publish; CatalogOS supplier crawl when online</p>
        </Link>
        <Link
          href="/admin/products/import/jobs"
          className="rounded-lg border border-white/10 bg-[#161616] p-4 shadow-sm ring-1 ring-white/[0.03] transition hover:border-[#f06232]/40 hover:ring-[#f06232]/15"
        >
          <div className="text-sm font-semibold text-white">View import jobs</div>
          <p className="mt-1 text-xs text-neutral-500">Monitor queued, running, and completed crawls</p>
        </Link>
        <Link
          href="/admin/products/import/csv"
          className="rounded-lg border border-white/10 bg-[#161616] p-4 shadow-sm ring-1 ring-white/[0.03] transition hover:border-[#f06232]/40 hover:ring-[#f06232]/15"
        >
          <div className="text-sm font-semibold text-white">CSV import (roadmap)</div>
          <p className="mt-1 text-xs text-neutral-500">Feed mapper not in storefront yet — export grid CSV from command center today</p>
        </Link>
      </div>

      {offline ? (
        <div className="mb-6 rounded-lg border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          <strong className="font-semibold text-red-50">Ingestion offline — configure CatalogOS connection.</strong>{" "}
          <span className="text-red-200/90">{conn.message}</span>
        </div>
      ) : null}

      <StatGrid columns={4} className="mb-6">
        <StatCard
          label="CatalogOS"
          value={conn.status === "online" ? "Online" : conn.status === "misconfigured" ? "Misconfigured" : "Offline"}
          color={conn.status === "online" ? "green" : conn.status === "misconfigured" ? "amber" : "red"}
          accentBorder
          variant="dark"
        />
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

      <div className="mb-6 rounded-lg border border-white/10 bg-[#161616] px-4 py-3 text-sm text-neutral-300 ring-1 ring-white/[0.03]">
        <strong className="text-white">Storefront admin does not write canonical products directly.</strong>{" "}
        CatalogOS owns extraction, matching, staging, and publish. This page only orchestrates operator actions.
      </div>

      <div className="mb-6">
        <UrlImportPanel offline={offline} offlineMessage={conn.message} />
      </div>

      <div className="mb-6">
        <UrlJobsPanel initialJobs={jobs} initialError={error} offline={offline} />
      </div>

      <section aria-label="Coming next" className="mb-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-[#141414] p-4 opacity-95 ring-1 ring-white/[0.03]">
          <h3 className="text-sm font-semibold text-white">CSV / spreadsheet import</h3>
          <p className="mt-2 text-xs leading-relaxed text-neutral-500">
            Upload feeds, map columns, and preview standardized rows before staging. Handled in CatalogOS ingestion pipelines.
          </p>
          <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-neutral-600">Roadmap</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#141414] p-4 opacity-95 ring-1 ring-white/[0.03]">
          <h3 className="text-sm font-semibold text-white">Publish from review queue</h3>
          <p className="mt-2 text-xs leading-relaxed text-neutral-500">
            Operator review and guarded publish into canonical catalog. CatalogOS publish-service rules apply.
          </p>
          <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-neutral-600">Roadmap</p>
        </div>
      </section>

      <p className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
        <ImportStatusBadge status="completed" /> indicates CatalogOS finished a crawl. Bridge sends selected rows to CatalogOS for upstream
        review. The storefront <strong className="text-neutral-400">Review queue</strong> lists <strong className="text-neutral-400">clipboard URL staging</strong> in Supabase—not CatalogOS batch rows. Storefront never writes canonical products.
      </p>
    </div>
  );
}
