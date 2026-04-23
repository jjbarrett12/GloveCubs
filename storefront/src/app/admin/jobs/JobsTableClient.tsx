"use client";

/**
 * Jobs Table Client Component
 * 
 * Interactive table with filtering, row selection, and slide-over detail view
 */

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  StatusBadge,
  SlideOver,
  SlideOverSection,
  TableToolbar,
  EmptyState,
} from "@/components/admin";

interface JobRow {
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

interface Props {
  jobs: JobRow[];
  jobTypes: string[];
  currentFilters: {
    status?: string;
    type?: string;
  };
  stats: {
    byStatus: Record<string, number>;
    byType: Record<string, number>;
  };
}

export function JobsTableClient({ jobs, jobTypes, currentFilters, stats }: Props) {
  const router = useRouter();
  const [selectedJob, setSelectedJob] = useState<JobRow | null>(null);
  const [localSearch, setLocalSearch] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const filteredJobs = useMemo(() => {
    if (!localSearch.trim()) return jobs;
    const search = localSearch.toLowerCase();
    return jobs.filter(
      (job) =>
        job.job_type.toLowerCase().includes(search) ||
        job.id.toLowerCase().includes(search) ||
        job.source_id?.toLowerCase().includes(search) ||
        job.last_error?.toLowerCase().includes(search)
    );
  }, [jobs, localSearch]);

  const buildFilterUrl = (key: string, value: string) => {
    const params = new URLSearchParams();
    const filters = { ...currentFilters, [key]: value };
    Object.entries(filters).forEach(([k, v]) => {
      if (v && v !== "all") params.set(k, v);
    });
    const query = params.toString();
    return query ? `/admin/jobs?${query}` : "/admin/jobs";
  };

  const formatDate = (date: string | null) => {
    if (!date) return null;
    return new Date(date).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const formatDuration = (start: string | null, end: string | null) => {
    if (!start) return null;
    const startTime = new Date(start).getTime();
    const endTime = end ? new Date(end).getTime() : Date.now();
    const ms = endTime - startTime;
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  };

  const handleRetry = async () => {
    if (!selectedJob) return;
    setActionLoading(true);
    try {
      await fetch(`/api/admin/jobs/${selectedJob.id}/retry`, { method: "POST" });
      router.refresh();
      setSelectedJob(null);
    } catch (error) {
      console.error("Retry failed:", error);
    } finally {
      setActionLoading(false);
    }
  };

  const statusOptions = [
    { value: "all", label: "All", count: Object.values(stats.byStatus).reduce((a, b) => a + b, 0) },
    { value: "pending", label: "Pending", count: stats.byStatus.pending },
    { value: "running", label: "Running", count: stats.byStatus.running },
    { value: "failed", label: "Failed", count: stats.byStatus.failed },
    { value: "blocked", label: "Blocked", count: stats.byStatus.blocked },
  ];

  return (
    <>
      <TableToolbar className="flex-wrap gap-2">
        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            className="w-48 pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <svg
            className="absolute left-2.5 top-2 w-4 h-4 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {/* Status tabs */}
        <div className="flex items-center gap-1">
          {statusOptions.map((opt) => (
            <a
              key={opt.value}
              href={buildFilterUrl("status", opt.value)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-sm font-medium rounded-md transition-colors ${
                (currentFilters.status || "all") === opt.value
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
              }`}
            >
              {opt.label}
              <span
                className={`text-xs tabular-nums px-1 rounded ${
                  (currentFilters.status || "all") === opt.value ? "bg-white/20" : "bg-gray-200/80"
                }`}
              >
                {opt.count}
              </span>
            </a>
          ))}
        </div>

        {/* Type filter */}
        <select
          value={currentFilters.type || "all"}
          onChange={(e) => router.push(buildFilterUrl("type", e.target.value))}
          className="text-sm border border-gray-300 rounded-md py-1.5 px-2 bg-white"
        >
          <option value="all">All Types</option>
          {jobTypes.map((type) => (
            <option key={type} value={type}>
              {type.replace(/_/g, " ")} ({stats.byType[type] || 0})
            </option>
          ))}
        </select>

        <div className="flex-1" />
        <span className="text-xs text-gray-400">{filteredJobs.length} jobs</span>
      </TableToolbar>

      {filteredJobs.length === 0 ? (
        <EmptyState
          icon={
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" strokeWidth="1" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
            </svg>
          }
          title="No jobs found"
          description={localSearch ? "Try adjusting your search" : "The job queue is empty"}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Attempts</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Error</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {filteredJobs.map((job) => (
                <tr
                  key={job.id}
                  onClick={() => setSelectedJob(job)}
                  className={`cursor-pointer transition-colors hover:bg-blue-50 ${
                    selectedJob?.id === job.id ? "bg-blue-50" : ""
                  }`}
                >
                  <td className="px-3 py-2 text-sm text-gray-600 whitespace-nowrap">
                    {formatDate(job.created_at)}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center px-2 py-0.5 text-xs font-mono bg-gray-100 text-gray-700 rounded">
                      {job.job_type}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={job.status} dot />
                  </td>
                  <td className="px-3 py-2">
                    <PriorityIndicator priority={job.priority} />
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-600 font-mono">
                    {job.attempt_count}/{job.max_attempts}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-500 font-mono">
                    {formatDuration(job.started_at, job.completed_at) || "—"}
                  </td>
                  <td className="px-3 py-2 text-sm text-red-600 truncate max-w-[200px]" title={job.last_error || ""}>
                    {job.last_error || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Panel */}
      <SlideOver
        open={!!selectedJob}
        onClose={() => setSelectedJob(null)}
        title={selectedJob?.job_type.replace(/_/g, " ") || "Job Details"}
        subtitle={selectedJob?.id}
        width="lg"
        footer={
          <div className="flex gap-2">
            {selectedJob?.status === "failed" && (
              <button
                onClick={handleRetry}
                disabled={actionLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {actionLoading ? "Retrying..." : "Retry Job"}
              </button>
            )}
            <button
              onClick={() => setSelectedJob(null)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        }
      >
        {selectedJob && (
          <>
            <SlideOverSection title="Status">
              <div className="flex items-center gap-3">
                <StatusBadge status={selectedJob.status} size="md" dot />
                <PriorityIndicator priority={selectedJob.priority} showLabel />
              </div>
            </SlideOverSection>

            <SlideOverSection title="Execution">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Attempts</span>
                  <div className="font-mono">{selectedJob.attempt_count} of {selectedJob.max_attempts}</div>
                </div>
                <div>
                  <span className="text-gray-500">Worker</span>
                  <div className="font-mono text-xs">{selectedJob.locked_by || "—"}</div>
                </div>
                <div>
                  <span className="text-gray-500">Created</span>
                  <div className="text-xs">{formatDate(selectedJob.created_at)}</div>
                </div>
                <div>
                  <span className="text-gray-500">Started</span>
                  <div className="text-xs">{formatDate(selectedJob.started_at) || "—"}</div>
                </div>
                <div>
                  <span className="text-gray-500">Completed</span>
                  <div className="text-xs">{formatDate(selectedJob.completed_at) || "—"}</div>
                </div>
                <div>
                  <span className="text-gray-500">Duration</span>
                  <div className="font-mono text-xs">
                    {formatDuration(selectedJob.started_at, selectedJob.completed_at) || "—"}
                  </div>
                </div>
              </div>
            </SlideOverSection>

            {selectedJob.source_table && (
              <SlideOverSection title="Source">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Table</span>
                    <div className="font-mono text-xs">{selectedJob.source_table}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">ID</span>
                    <div className="font-mono text-xs">{selectedJob.source_id || "—"}</div>
                  </div>
                </div>
              </SlideOverSection>
            )}

            {selectedJob.last_error && (
              <SlideOverSection title="Error">
                <div className="bg-red-50 border border-red-200 rounded-md p-3">
                  <pre className="text-xs text-red-700 whitespace-pre-wrap font-mono">
                    {selectedJob.last_error}
                  </pre>
                </div>
              </SlideOverSection>
            )}

            {selectedJob.blocked_reason && (
              <SlideOverSection title="Blocked Reason">
                <div className="bg-purple-50 border border-purple-200 rounded-md p-3">
                  <p className="text-sm text-purple-700">{selectedJob.blocked_reason}</p>
                </div>
              </SlideOverSection>
            )}

            <SlideOverSection title="Payload">
              <div className="bg-gray-50 rounded-md p-3 overflow-x-auto border border-gray-200">
                <pre className="text-xs text-gray-700 font-mono">
                  {JSON.stringify(selectedJob.payload, null, 2)}
                </pre>
              </div>
            </SlideOverSection>
          </>
        )}
      </SlideOver>
    </>
  );
}

function PriorityIndicator({ priority, showLabel = false }: { priority: number; showLabel?: boolean }) {
  const getPriorityInfo = (p: number) => {
    if (p <= 1) return { label: "Critical", color: "bg-red-500" };
    if (p <= 3) return { label: "High", color: "bg-orange-500" };
    if (p <= 5) return { label: "Normal", color: "bg-blue-500" };
    return { label: "Low", color: "bg-gray-400" };
  };

  const info = getPriorityInfo(priority);

  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2 h-2 rounded-full ${info.color}`} />
      {showLabel && <span className="text-sm text-gray-600">{info.label}</span>}
      <span className="text-xs text-gray-400 font-mono">{priority}</span>
    </div>
  );
}
