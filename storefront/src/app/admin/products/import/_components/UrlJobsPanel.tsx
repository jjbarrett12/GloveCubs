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
    <TableCard variant="dark">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#181818] px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-white">Recent URL imports</h2>
          <p className="text-xs text-neutral-500">
            Live data from CatalogOS — no fabricated counts.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-neutral-600">
            {lastRefreshed ? `Refreshed ${lastRefreshed.toISOString().slice(11, 19)} UTC` : "Not yet refreshed"}
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={offline || loading}
            className="rounded-md border border-white/12 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-neutral-200 shadow-sm hover:border-[#f06232]/35 hover:text-white disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="border-b border-red-500/25 bg-red-500/10 px-4 py-2 text-xs text-red-100">
          {error}
        </div>
      ) : null}

      {jobs.length === 0 ? (
        <EmptyState
          variant="dark"
          title={offline ? "CatalogOS not configured" : "No URL imports yet"}
          description={offline ? "Configure CatalogOS to load URL import history." : "Start one above to see jobs here."}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead className="border-b border-white/10 bg-[#181818] text-xs font-medium uppercase tracking-wide text-neutral-500">
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
            <tbody className="divide-y divide-white/[0.06] bg-[#141414] text-neutral-100">
              {jobs.map((j) => (
                <tr key={j.id} className="hover:bg-white/[0.04]">
                  <td className="px-3 py-2 align-top">
                    <ImportStatusBadge status={j.status} rawStatus={j.rawStatus} />
                  </td>
                  <td className="px-3 py-2 align-top text-neutral-300">{j.supplierName}</td>
                  <td className="px-3 py-2 align-top">
                    {j.startUrl ? (
                      <span className="break-all font-mono text-[11px] text-neutral-400">{j.startUrl}</span>
                    ) : (
                      <span className="text-neutral-600">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top font-mono text-[11px] text-neutral-400">
                    {j.crawlMode ?? "—"}
                  </td>
                  <td className="px-3 py-2 align-top font-mono text-neutral-200">{formatNumber(j.pagesCrawled)}</td>
                  <td className="px-3 py-2 align-top font-mono text-neutral-200">{formatNumber(j.productsExtracted)}</td>
                  <td className="px-3 py-2 align-top font-mono text-[11px] text-neutral-500">
                    {formatDate(j.createdAt)}
                  </td>
                  <td className="px-3 py-2 align-top font-mono text-[11px] text-neutral-500">
                    {formatDate(j.finishedAt)}
                  </td>
                  <td className="px-3 py-2 align-top text-right">
                    <Link
                      href={`/admin/products/import/jobs/${encodeURIComponent(j.id)}`}
                      className="rounded-md border border-white/12 bg-white/[0.06] px-2 py-1 text-xs font-medium text-[#f06232] shadow-sm hover:border-[#f06232]/40 hover:text-[#ff8a5c]"
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
