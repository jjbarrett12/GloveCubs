/**
 * Admin Jobs Dashboard
 * 
 * View and manage job queue with filtering by status and type
 */

import { Suspense } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  PageHeader,
  StatCard,
  StatGrid,
  TableCard,
  LoadingState,
} from "@/components/admin";
import { JobsTableClient } from "./JobsTableClient";

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

export interface JobRow {
  id: string;
  job_type: string;
  status: string;
  priority: number;
  attempt_count: number;
  max_attempts: number;
  locked_by: string | null;
  last_error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  payload: Record<string, unknown>;
  blocked_reason: string | null;
  source_table: string | null;
  source_id: string | null;
  dedupe_key: string | null;
}

interface SearchParams {
  status?: string;
  type?: string;
}

async function getJobStats() {
  const supabase = await getSupabase();
  const { data } = await supabase.from("job_queue").select("status, job_type");

  const stats = {
    byStatus: { pending: 0, running: 0, completed: 0, failed: 0, blocked: 0, cancelled: 0 } as Record<string, number>,
    byType: {} as Record<string, number>,
    total: 0,
  };

  (data || []).forEach((row) => {
    stats.total++;
    stats.byStatus[row.status] = (stats.byStatus[row.status] || 0) + 1;
    stats.byType[row.job_type] = (stats.byType[row.job_type] || 0) + 1;
  });

  return stats;
}

async function getJobs(params: SearchParams): Promise<JobRow[]> {
  const supabase = await getSupabase();

  let query = supabase
    .from("job_queue")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (params.status && params.status !== "all") {
    query = query.eq("status", params.status);
  }

  if (params.type && params.type !== "all") {
    query = query.eq("job_type", params.type);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as JobRow[];
}

function JobStats({ stats }: { stats: Awaited<ReturnType<typeof getJobStats>> }) {
  return (
    <StatGrid columns={6}>
      <StatCard label="Pending" value={stats.byStatus.pending} color="amber" href="/admin/jobs?status=pending" />
      <StatCard label="Running" value={stats.byStatus.running} color="blue" href="/admin/jobs?status=running" />
      <StatCard label="Completed" value={stats.byStatus.completed} color="green" />
      <StatCard label="Failed" value={stats.byStatus.failed} color="red" href="/admin/jobs?status=failed" />
      <StatCard label="Blocked" value={stats.byStatus.blocked} color="purple" href="/admin/jobs?status=blocked" />
      <StatCard label="Cancelled" value={stats.byStatus.cancelled} color="default" />
    </StatGrid>
  );
}

async function JobsContent({ params }: { params: SearchParams }) {
  const [stats, jobs] = await Promise.all([
    getJobStats(),
    getJobs(params),
  ]);

  const jobTypes = Object.keys(stats.byType).sort();

  return (
    <>
      <div className="mb-6">
        <JobStats stats={stats} />
      </div>

      <TableCard>
        <JobsTableClient
          jobs={jobs}
          jobTypes={jobTypes}
          currentFilters={params}
          stats={stats}
        />
      </TableCard>
    </>
  );
}

export default async function AdminJobsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  return (
    <div>
      <PageHeader
        title="Job Queue"
        description="Monitor and manage background job processing"
        actions={
          <a
            href="/admin/runs"
            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            View Run History
          </a>
        }
      />

      <Suspense fallback={<LoadingState message="Loading jobs..." />}>
        <JobsContent params={params} />
      </Suspense>
    </div>
  );
}
