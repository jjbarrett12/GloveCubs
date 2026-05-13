"use client";

import * as React from "react";
import Link from "next/link";
import { ImportStatusBadge } from "./ImportStatusBadge";
import {
  adaptUrlImportJobList,
  type UrlImportJobSummary,
} from "@/lib/admin/url-import-adapter";
import { TableCard, EmptyState } from "@/components/admin";

function formatNumber(n: number | null): string {
  return n == null ? "—" : new Intl.NumberFormat().format(n);
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString().replace("T", " ").slice(0, 16);
}

export function UrlJobsPanel({
  initialJobs,
  initialError,
  offline,
}: {
  initialJobs: UrlImportJobSummary[];
  initialError: string | null;
  offline: boolean;
}) {
  const [jobs, setJobs] = React.useState<UrlImportJobSummary[]>(initialJobs);
  const [error, setError] = React.useState<string | null>(initialError);
  const [loading, setLoading] = React.useState(false);
  const [lastRefreshed, setLastRefreshed] = React.useState<Date | null>(initialJobs.length ? new Date() : null);

  async function refresh() {
    if (offline || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/admin/api/products/import/url/jobs?limit=50", {
        cache: "no-store",
      });
      const text = await res.text();
      const data = text ? (JSON.parse(text) as unknown) : [];
      if (!res.ok) {
        const msg =
          (data && typeof data === "object" && "error" in data && typeof (data as { error?: unknown }).error === "string"
            ? (data as { error: string }).error
            : `Refresh failed (status ${res.status}).`);
        setError(msg);
        return;
      }
      setJobs(adaptUrlImportJobList(data));
      setLastRefreshed(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <TableCard>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Recent import runs</h2>
          <p className="text-sm text-slate-600">Live status from the import service—no placeholder numbers.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-slate-500">
            {lastRefreshed ? `Refreshed ${lastRefreshed.toISOString().slice(11, 19)} UTC` : "Not yet refreshed"}
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={offline || loading}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {jobs.length === 0 ? (
        <EmptyState
          title={offline ? "Catalog sync not configured" : "No import runs yet"}
          description={offline ? "Finish catalog sync setup to load history." : "Start a crawl above to see runs here."}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Start URL</th>
                <th className="px-4 py-3">Mode</th>
                <th className="px-4 py-3">Pages crawled</th>
                <th className="px-4 py-3">Products</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Finished</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-slate-800">
              {jobs.map((j) => (
                <tr key={j.id} className="transition-colors hover:bg-slate-50/80">
                  <td className="px-4 py-3 align-top">
                    <ImportStatusBadge status={j.status} rawStatus={j.rawStatus} />
                  </td>
                  <td className="px-4 py-3 align-top text-slate-600">{j.supplierName}</td>
                  <td className="px-4 py-3 align-top">
                    {j.startUrl ? (
                      <span className="break-all font-mono text-xs text-slate-600">{j.startUrl}</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top font-mono text-xs text-slate-600">
                    {j.crawlMode ?? "—"}
                  </td>
                  <td className="px-4 py-3 align-top font-mono text-slate-800">{formatNumber(j.pagesCrawled)}</td>
                  <td className="px-4 py-3 align-top font-mono text-slate-800">{formatNumber(j.productsExtracted)}</td>
                  <td className="px-4 py-3 align-top font-mono text-xs text-slate-500">
                    {formatDate(j.createdAt)}
                  </td>
                  <td className="px-4 py-3 align-top font-mono text-xs text-slate-500">
                    {formatDate(j.finishedAt)}
                  </td>
                  <td className="px-4 py-3 align-top text-right">
                    <Link
                      href={`/admin/products/import/jobs/${encodeURIComponent(j.id)}`}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-[#c2410c] shadow-sm hover:border-[#f06232]/40 hover:bg-[#fff7f2]"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </TableCard>
  );
}
