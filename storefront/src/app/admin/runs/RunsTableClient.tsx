"use client";

/**
 * Pipeline Runs Table Client
 * 
 * Interactive table with filtering and run detail view
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

interface JobRunRow {
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

interface Props {
  runs: JobRunRow[];
  jobTypes: string[];
  currentFilters: {
    status?: string;
    type?: string;
    days?: string;
  };
}

const STATUS_MAP: Record<string, string> = {
  started: "running",
  completed: "completed",
  failed: "failed",
  blocked: "blocked",
};

export function RunsTableClient({ runs, jobTypes, currentFilters }: Props) {
  const router = useRouter();
  const [selectedRun, setSelectedRun] = useState<JobRunRow | null>(null);
  const [localSearch, setLocalSearch] = useState("");

  const filteredRuns = useMemo(() => {
    if (!localSearch.trim()) return runs;
    const search = localSearch.toLowerCase();
    return runs.filter(
      (run) =>
        run.job_type.toLowerCase().includes(search) ||
        run.job_id.toLowerCase().includes(search) ||
        run.worker_name?.toLowerCase().includes(search) ||
        run.error_message?.toLowerCase().includes(search)
    );
  }, [runs, localSearch]);

  const buildFilterUrl = (key: string, value: string) => {
    const params = new URLSearchParams();
    const filters = { ...currentFilters, [key]: value };
    Object.entries(filters).forEach(([k, v]) => {
      if (v && v !== "all") params.set(k, v);
    });
    const query = params.toString();
    return query ? `/admin/runs?${query}` : "/admin/runs";
  };

  const formatDate = (date: string | null) => {
    if (!date) return "—";
    return new Date(date).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const formatDuration = (ms: number | null) => {
    if (ms == null) return "—";
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  };

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

        {/* Status filter */}
        <select
          value={currentFilters.status || "all"}
          onChange={(e) => router.push(buildFilterUrl("status", e.target.value))}
          className="text-sm border border-gray-300 rounded-md py-1.5 px-2 bg-white"
        >
          <option value="all">All Status</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="blocked">Blocked</option>
          <option value="started">Running</option>
        </select>

        {/* Type filter */}
        <select
          value={currentFilters.type || "all"}
          onChange={(e) => router.push(buildFilterUrl("type", e.target.value))}
          className="text-sm border border-gray-300 rounded-md py-1.5 px-2 bg-white"
        >
          <option value="all">All Types</option>
          {jobTypes.map((type) => (
            <option key={type} value={type}>
              {type.replace(/_/g, " ")}
            </option>
          ))}
        </select>

        {/* Date filter */}
        <select
          value={currentFilters.days || "all"}
          onChange={(e) => router.push(buildFilterUrl("days", e.target.value))}
          className="text-sm border border-gray-300 rounded-md py-1.5 px-2 bg-white"
        >
          <option value="all">All Time</option>
          <option value="1">Today</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
        </select>

        <div className="flex-1" />
        <span className="text-xs text-gray-400">{filteredRuns.length} runs</span>
      </TableToolbar>

      {filteredRuns.length === 0 ? (
        <EmptyState
          icon={
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" strokeWidth="1" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
            </svg>
          }
          title="No runs found"
          description={localSearch ? "Try adjusting your search" : "No job runs match the current filters"}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Job Type</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Started</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Worker</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Error</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {filteredRuns.map((run) => (
                <tr
                  key={run.id}
                  onClick={() => setSelectedRun(run)}
                  className={`cursor-pointer transition-colors hover:bg-blue-50 ${
                    selectedRun?.id === run.id ? "bg-blue-50" : ""
                  }`}
                >
                  <td className="px-3 py-2">
                    <StatusBadge status={STATUS_MAP[run.status] || run.status} />
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center px-2 py-0.5 text-xs font-mono bg-gray-100 text-gray-700 rounded">
                      {run.job_type}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-600 whitespace-nowrap">
                    {formatDate(run.started_at)}
                  </td>
                  <td className="px-3 py-2 text-sm font-mono text-gray-600">
                    {formatDuration(run.duration_ms)}
                  </td>
                  <td className="px-3 py-2 text-xs font-mono text-gray-500 truncate max-w-[150px]">
                    {run.worker_name || "—"}
                  </td>
                  <td className="px-3 py-2 text-sm text-red-600 truncate max-w-[200px]" title={run.error_message || ""}>
                    {run.error_message || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Panel */}
      <SlideOver
        open={!!selectedRun}
        onClose={() => setSelectedRun(null)}
        title={selectedRun?.job_type.replace(/_/g, " ") || "Run Details"}
        subtitle={selectedRun?.id}
        width="xl"
      >
        {selectedRun && (
          <>
            <SlideOverSection title="Status">
              <div className="flex items-center gap-3">
                <StatusBadge status={STATUS_MAP[selectedRun.status] || selectedRun.status} size="md" />
                <span className="text-sm text-gray-500">
                  Duration: {formatDuration(selectedRun.duration_ms)}
                </span>
              </div>
            </SlideOverSection>

            <SlideOverSection title="Timing">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Started</span>
                  <div className="font-mono text-xs">{formatDate(selectedRun.started_at)}</div>
                </div>
                <div>
                  <span className="text-gray-500">Ended</span>
                  <div className="font-mono text-xs">{formatDate(selectedRun.ended_at)}</div>
                </div>
                <div>
                  <span className="text-gray-500">Job ID</span>
                  <div className="font-mono text-xs">{selectedRun.job_id}</div>
                </div>
                <div>
                  <span className="text-gray-500">Worker</span>
                  <div className="font-mono text-xs">{selectedRun.worker_name || "—"}</div>
                </div>
              </div>
            </SlideOverSection>

            {selectedRun.error_message && (
              <SlideOverSection title="Error">
                <div className="bg-red-50 border border-red-200 rounded-md p-3">
                  <pre className="text-xs text-red-700 whitespace-pre-wrap font-mono">
                    {selectedRun.error_message}
                  </pre>
                </div>
              </SlideOverSection>
            )}

            <SlideOverSection title="Input Payload">
              <div className="bg-gray-50 rounded-md p-3 overflow-x-auto border border-gray-200">
                <pre className="text-xs text-gray-700 font-mono">
                  {JSON.stringify(selectedRun.input_payload, null, 2)}
                </pre>
              </div>
            </SlideOverSection>

            {selectedRun.output_payload && (
              <SlideOverSection title="Output Payload">
                <div className="bg-gray-50 rounded-md p-3 overflow-x-auto border border-gray-200">
                  <pre className="text-xs text-gray-700 font-mono">
                    {JSON.stringify(selectedRun.output_payload, null, 2)}
                  </pre>
                </div>
              </SlideOverSection>
            )}
          </>
        )}
      </SlideOver>
    </>
  );
}
