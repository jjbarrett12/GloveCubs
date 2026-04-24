/**
 * Admin Operations Dashboard
 * 
 * Overview page with system health and quick access
 */

import { Suspense } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import Link from "next/link";
import {
  PageHeader,
  StatCard,
  StatGrid,
  LoadingState,
  StatusBadge,
} from "@/components/admin";

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );
}

async function getDashboardStats() {
  const supabase = await getSupabase();

  const [jobsResult, reviewsResult, auditsResult, runsResult] = await Promise.all([
    supabase.from("job_queue").select("status, job_type"),
    supabase.from("review_queue").select("status, priority, review_type").in("status", ["open", "in_review"]),
    supabase.from("audit_reports").select("status, created_at").order("created_at", { ascending: false }).limit(1),
    supabase.from("job_runs").select("status, duration_ms").gte("started_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
  ]);

  const jobs = jobsResult.data || [];
  const reviews = reviewsResult.data || [];
  const lastAudit = auditsResult.data?.[0];
  const runs = runsResult.data || [];

  return {
    jobs: {
      pending: jobs.filter((j) => j.status === "pending").length,
      running: jobs.filter((j) => j.status === "running").length,
      failed: jobs.filter((j) => j.status === "failed").length,
      blocked: jobs.filter((j) => j.status === "blocked").length,
    },
    reviews: {
      total: reviews.length,
      critical: reviews.filter((r) => r.priority === "critical").length,
      high: reviews.filter((r) => r.priority === "high").length,
      byType: reviews.reduce((acc, r) => {
        acc[r.review_type] = (acc[r.review_type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    },
    audit: lastAudit,
    runs: {
      total: runs.length,
      failed: runs.filter((r) => r.status === "failed").length,
      avgDuration: runs.length > 0
        ? Math.round(runs.reduce((sum, r) => sum + (r.duration_ms || 0), 0) / runs.length)
        : 0,
    },
  };
}

async function getCatalogListingStats() {
  const supabase = await getSupabase();
  const { count: catalogActive, error: catalogErr } = await supabase
    .schema("catalog_v2")
    .from("catalog_products")
    .select("*", { count: "exact", head: true })
    .eq("status", "active");

  return {
    catalogActive: catalogActive ?? 0,
    catalogError: catalogErr?.message ?? null,
  };
}

async function getRecentIssues() {
  const supabase = await getSupabase();

  const [failedJobs, criticalReviews] = await Promise.all([
    supabase
      .from("job_queue")
      .select("id, job_type, last_error, created_at")
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("review_queue")
      .select("id, title, review_type, priority, created_at")
      .in("status", ["open", "in_review"])
      .in("priority", ["critical", "high"])
      .order("priority_order", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(5),
  ]);

  return {
    failedJobs: failedJobs.data || [],
    criticalReviews: criticalReviews.data || [],
  };
}

function formatDate(date: string) {
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m`;
}

async function DashboardContent() {
  const [stats, issues, catalogStats] = await Promise.all([
    getDashboardStats(),
    getRecentIssues(),
    getCatalogListingStats(),
  ]);

  const hasIssues = stats.jobs.failed > 0 || stats.reviews.critical > 0 || stats.jobs.blocked > 0;

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Catalog</h2>
        <StatGrid columns={2}>
          <StatCard
            label="Active catalog products (catalog_v2)"
            value={catalogStats.catalogError ? "—" : catalogStats.catalogActive}
            color="default"
            href="/admin/products"
          />
          <StatCard label="Ingestion" value="Open" color="default" href="/admin/ingestion" />
        </StatGrid>
        {catalogStats.catalogError ? (
          <p className="mt-2 text-sm text-red-600">catalog_v2.catalog_products: {catalogStats.catalogError}</p>
        ) : null}
      </section>

      {/* System Health */}
      <section>
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
          System Health
        </h2>
        <StatGrid columns={5}>
          <StatCard
            label="Active Jobs"
            value={stats.jobs.pending + stats.jobs.running}
            color={stats.jobs.running > 0 ? "blue" : "default"}
            href="/admin/jobs"
          />
          <StatCard
            label="Failed Jobs"
            value={stats.jobs.failed}
            color={stats.jobs.failed > 0 ? "red" : "green"}
            href="/admin/jobs?status=failed"
          />
          <StatCard
            label="Blocked"
            value={stats.jobs.blocked}
            color={stats.jobs.blocked > 0 ? "purple" : "default"}
            href="/admin/jobs?status=blocked"
          />
          <StatCard
            label="Runs (24h)"
            value={stats.runs.total}
            color="default"
            href="/admin/runs?days=1"
          />
          <StatCard
            label="Avg Duration"
            value={formatDuration(stats.runs.avgDuration)}
            color="default"
          />
        </StatGrid>
      </section>

      {/* Review Queue */}
      <section>
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
          Review Queue
        </h2>
        <StatGrid columns={6}>
          <StatCard
            label="Total Open"
            value={stats.reviews.total}
            color={stats.reviews.critical > 0 ? "red" : stats.reviews.total > 0 ? "amber" : "green"}
            href="/admin/review"
          />
          <StatCard
            label="Critical"
            value={stats.reviews.critical}
            color="red"
            href="/admin/review?priority=critical"
          />
          <StatCard
            label="Catalog"
            value={stats.reviews.byType.catalog || 0}
            color="default"
            href="/admin/review?type=catalog"
          />
          <StatCard
            label="Match"
            value={stats.reviews.byType.product_match || 0}
            color="default"
            href="/admin/review?type=product_match"
          />
          <StatCard
            label="Pricing"
            value={stats.reviews.byType.pricing || 0}
            color="default"
            href="/admin/review?type=pricing"
          />
          <StatCard
            label="Supplier"
            value={stats.reviews.byType.supplier || 0}
            color="default"
            href="/admin/review?type=supplier"
          />
        </StatGrid>
      </section>

      {/* Recent Issues */}
      {hasIssues && (
        <section>
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
            Needs Attention
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Failed Jobs */}
            {issues.failedJobs.length > 0 && (
              <div className="bg-white rounded-lg border border-red-200 overflow-hidden">
                <div className="px-4 py-2 bg-red-50 border-b border-red-200">
                  <h3 className="text-sm font-medium text-red-800">Failed Jobs</h3>
                </div>
                <div className="divide-y divide-gray-100">
                  {issues.failedJobs.map((job) => (
                    <Link
                      key={job.id}
                      href={`/admin/jobs?status=failed`}
                      className="block px-4 py-2 hover:bg-gray-50"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-mono text-gray-900">{job.job_type}</span>
                        <span className="text-xs text-gray-500">{formatDate(job.created_at)}</span>
                      </div>
                      <p className="text-xs text-red-600 truncate mt-0.5">{job.last_error}</p>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Critical Reviews */}
            {issues.criticalReviews.length > 0 && (
              <div className="bg-white rounded-lg border border-orange-200 overflow-hidden">
                <div className="px-4 py-2 bg-orange-50 border-b border-orange-200">
                  <h3 className="text-sm font-medium text-orange-800">Priority Reviews</h3>
                </div>
                <div className="divide-y divide-gray-100">
                  {issues.criticalReviews.map((review) => (
                    <Link
                      key={review.id}
                      href={`/admin/review?priority=${review.priority}`}
                      className="block px-4 py-2 hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-2">
                        <StatusBadge status={review.priority} />
                        <span className="text-sm text-gray-900 truncate flex-1">{review.title}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-500">{review.review_type}</span>
                        <span className="text-xs text-gray-400">{formatDate(review.created_at)}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Quick Actions */}
      <section>
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
          Quick Access
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <QuickLink
            href="/admin/ingestion"
            title="CSV import"
            description="Batch ingest and CatalogOS console"
          />
          <QuickLink
            href="/admin/review?type=catalog"
            title="Catalog Issues"
            description="Product ingestion and normalization"
            count={stats.reviews.byType.catalog}
          />
          <QuickLink
            href="/admin/review?type=product_match"
            title="Match Review"
            description="Uncertain product matches"
            count={stats.reviews.byType.product_match}
          />
          <QuickLink
            href="/admin/review?type=pricing"
            title="Pricing Anomalies"
            description="Price and margin issues"
            count={stats.reviews.byType.pricing}
          />
          <QuickLink
            href="/admin/review?type=supplier"
            title="Supplier Issues"
            description="Supplier discovery and verification"
            count={stats.reviews.byType.supplier}
          />
        </div>
      </section>

      {/* Last Audit */}
      {stats.audit && (
        <section>
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
            Last Audit
          </h2>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <StatusBadge status={stats.audit.status === "completed" ? "success" : "error"} size="md" />
                <span className="ml-2 text-sm text-gray-600">
                  {formatDate(stats.audit.created_at)}
                </span>
              </div>
              <Link href="/admin/audit-reports" className="text-sm text-blue-600 hover:text-blue-800">
                View Reports →
              </Link>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function QuickLink({
  href,
  title,
  description,
  count,
}: {
  href: string;
  title: string;
  description: string;
  count?: number;
}) {
  return (
    <Link
      href={href}
      className="block p-3 bg-white rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-medium text-gray-900">{title}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        </div>
        {count !== undefined && count > 0 && (
          <span className="text-lg font-semibold text-gray-900 tabular-nums">{count}</span>
        )}
      </div>
    </Link>
  );
}

export default function AdminPage() {
  return (
    <div>
      <PageHeader
        title="Operations Dashboard"
        description="System health and review queue status"
      />

      <Suspense fallback={<LoadingState message="Loading dashboard..." />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}
