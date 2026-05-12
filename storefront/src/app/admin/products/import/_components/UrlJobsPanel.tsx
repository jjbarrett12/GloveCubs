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
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Recent URL imports</h2>
          <p className="text-xs text-gray-500">
            Live data from CatalogOS — no fabricated counts.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-gray-400">
            {lastRefreshed ? `Refreshed ${lastRefreshed.toISOString().slice(11, 19)} UTC` : "Not yet refreshed"}
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={offline || loading}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800">
          {error}
        </div>
      ) : null}

      {jobs.length === 0 ? (
        <EmptyState
          title={offline ? "CatalogOS not configured" : "No URL imports yet"}
          description={offline ? "Configure CatalogOS to load URL import history." : "Start one above to see jobs here."}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Supplier</th>
                <th className="px-3 py-2">Start URL</th>
                <th className="px-3 py-2">Mode</th>
                <th className="px-3 py-2">Pages crawled</th>
                <th className="px-3 py-2">Products</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Finished</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white text-gray-900">
              {jobs.map((j) => (
                <tr key={j.id} className="hover:bg-blue-50/40">
                  <td className="px-3 py-2 align-top">
                    <ImportStatusBadge status={j.status} rawStatus={j.rawStatus} />
                  </td>
                  <td className="px-3 py-2 align-top text-gray-700">{j.supplierName}</td>
                  <td className="px-3 py-2 align-top">
                    {j.startUrl ? (
                      <span className="break-all font-mono text-[11px] text-gray-600">{j.startUrl}</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top font-mono text-[11px] text-gray-600">
                    {j.crawlMode ?? "—"}
                  </td>
                  <td className="px-3 py-2 align-top font-mono text-gray-700">{formatNumber(j.pagesCrawled)}</td>
                  <td className="px-3 py-2 align-top font-mono text-gray-700">{formatNumber(j.productsExtracted)}</td>
                  <td className="px-3 py-2 align-top font-mono text-[11px] text-gray-500">
                    {formatDate(j.createdAt)}
                  </td>
                  <td className="px-3 py-2 align-top font-mono text-[11px] text-gray-500">
                    {formatDate(j.finishedAt)}
                  </td>
                  <td className="px-3 py-2 align-top text-right">
                    <Link
                      href={`/admin/products/import/jobs/${encodeURIComponent(j.id)}`}
                      className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-blue-700 shadow-sm hover:bg-blue-50"
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
