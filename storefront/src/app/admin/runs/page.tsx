/**
 * Admin Pipeline Runs Dashboard
 * 
 * View job execution history with detailed run logs
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
import { RunsTableClient } from "./RunsTableClient";

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

export interface JobRunRow {
  id: string;
  job_id: string;
  job_type: string;
  worker_name: string | null;
  status: "started" | "completed" | "failed" | "blocked";
  input_payload: Record<string, unknown>;
  output_payload: Record<string, unknown> | null;
  error_message: string | null;
  duration_ms: number | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
}

interface SearchParams {
  status?: string;
  type?: string;
  days?: string;
}

async function getRunStats() {
  const supabase = await getSupabase();
  
  const since = new Date();
  since.setDate(since.getDate() - 7);
  
  const { data } = await supabase
    .from("job_runs")
    .select("status, job_type, duration_ms")
    .gte("started_at", since.toISOString());

  const stats = {
    total: 0,
    completed: 0,
    failed: 0,
    blocked: 0,
    avgDuration: 0,
    byType: {} as Record<string, number>,
  };

  let totalDuration = 0;
  let durationCount = 0;

  (data || []).forEach((row) => {
    stats.total++;
    if (row.status === "completed") stats.completed++;
    if (row.status === "failed") stats.failed++;
    if (row.status === "blocked") stats.blocked++;
    stats.byType[row.job_type] = (stats.byType[row.job_type] || 0) + 1;
    if (row.duration_ms) {
      totalDuration += row.duration_ms;
      durationCount++;
    }
  });

  stats.avgDuration = durationCount > 0 ? Math.round(totalDuration / durationCount) : 0;

  return stats;
}

async function getJobRuns(params: SearchParams): Promise<JobRunRow[]> {
  const supabase = await getSupabase();

  let query = supabase
    .from("job_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(200);

  if (params.status && params.status !== "all") {
    query = query.eq("status", params.status);
  }

  if (params.type && params.type !== "all") {
    query = query.eq("job_type", params.type);
  }

  if (params.days) {
    const days = parseInt(params.days, 10);
    if (!isNaN(days)) {
      const since = new Date();
      since.setDate(since.getDate() - days);
      query = query.gte("started_at", since.toISOString());
    }
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as JobRunRow[];
}

function RunStats({ stats }: { stats: Awaited<ReturnType<typeof getRunStats>> }) {
  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m`;
  };

  const successRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  return (
    <StatGrid columns={5}>
      <StatCard
        label="Total Runs (7d)"
        value={stats.total}
        color="default"
      />
      <StatCard
        label="Completed"
        value={stats.completed}
        color="green"
      />
      <StatCard
        label="Failed"
        value={stats.failed}
        color={stats.failed > 0 ? "red" : "default"}
        href="/admin/runs?status=failed"
      />
      <StatCard
        label="Success Rate"
        value={`${successRate}%`}
        color={successRate >= 95 ? "green" : successRate >= 80 ? "amber" : "red"}
      />
      <StatCard
        label="Avg Duration"
        value={formatDuration(stats.avgDuration)}
        color="default"
      />
    </StatGrid>
  );
}

async function RunsContent({ params }: { params: SearchParams }) {
  const [stats, runs] = await Promise.all([
    getRunStats(),
    getJobRuns(params),
  ]);

  const jobTypes = Object.keys(stats.byType).sort();

  return (
    <>
      <div className="mb-6">
        <RunStats stats={stats} />
      </div>

      <TableCard>
        <RunsTableClient
          runs={runs}
          jobTypes={jobTypes}
          currentFilters={params}
        />
      </TableCard>
    </>
  );
}

export default async function AdminRunsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  return (
    <div>
      <PageHeader
        title="Pipeline Runs"
        description="Job execution history and performance"
      />

      <Suspense fallback={<LoadingState message="Loading runs..." />}>
        <RunsContent params={params} />
      </Suspense>
    </div>
  );
}
