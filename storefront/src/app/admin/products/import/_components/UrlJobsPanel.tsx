"use client";

import * as React from "react";
import Link from "next/link";
import { ImportStatusBadge } from "./ImportStatusBadge";
import {
  adaptUrlImportJobList,
  type UrlImportJobSummary,
} from "@/lib/admin/url-import-adapter";
import { TableCard, EmptyState } from "@/components/admin";
import {
  adminAlertSurface,
  adminLink,
  adminSecondaryButton,
  adminTableBody,
  adminTableCell,
  adminTableHead,
  adminTableHeadCell,
  adminTableRowHover,
} from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";

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
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-admin-border-subtle bg-admin-surface-muted px-4 py-4">
        <div>
          <h2 className="text-base font-semibold text-admin-primary">Recent import runs</h2>
          <p className="text-sm text-admin-secondary">Live status from the import service—no placeholder numbers.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-admin-muted">
            {lastRefreshed ? `Refreshed ${lastRefreshed.toISOString().slice(11, 19)} UTC` : "Not yet refreshed"}
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={offline || loading}
            className={cn(adminSecondaryButton, "text-xs")}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error ? (
        <div className={cn(adminAlertSurface("critical", "border-x-0 border-t-0 rounded-none"))}>{error}</div>
      ) : null}

      {jobs.length === 0 ? (
        <EmptyState
          title={offline ? "Catalog sync not configured" : "No import runs yet"}
          description={offline ? "Finish catalog sync setup to load history." : "Start a crawl above to see runs here."}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead className={cn(adminTableHead, "border-b border-admin-border")}>
              <tr>
                <th className={cn(adminTableHeadCell, "px-4 py-3")}>Status</th>
                <th className={cn(adminTableHeadCell, "px-4 py-3")}>Supplier</th>
                <th className={cn(adminTableHeadCell, "px-4 py-3")}>Start URL</th>
                <th className={cn(adminTableHeadCell, "px-4 py-3")}>Mode</th>
                <th className={cn(adminTableHeadCell, "px-4 py-3")}>Pages crawled</th>
                <th className={cn(adminTableHeadCell, "px-4 py-3")}>Products</th>
                <th className={cn(adminTableHeadCell, "px-4 py-3")}>Created</th>
                <th className={cn(adminTableHeadCell, "px-4 py-3")}>Finished</th>
                <th className={cn(adminTableHeadCell, "px-4 py-3")} />
              </tr>
            </thead>
            <tbody className={adminTableBody}>
              {jobs.map((j) => (
                <tr key={j.id} className={adminTableRowHover}>
                  <td className={cn(adminTableCell, "px-4 py-3 align-top")}>
                    <ImportStatusBadge status={j.status} rawStatus={j.rawStatus} />
                  </td>
                  <td className={cn(adminTableCell, "px-4 py-3 align-top text-admin-secondary")}>{j.supplierName}</td>
                  <td className={cn(adminTableCell, "px-4 py-3 align-top")}>
                    {j.startUrl ? (
                      <span className="break-all font-mono text-xs text-admin-secondary">{j.startUrl}</span>
                    ) : (
                      <span className="text-admin-muted">—</span>
                    )}
                  </td>
                  <td className={cn(adminTableCell, "px-4 py-3 align-top font-mono text-xs text-admin-secondary")}>
                    {j.crawlMode ?? "—"}
                  </td>
                  <td className={cn(adminTableCell, "px-4 py-3 align-top font-mono")}>{formatNumber(j.pagesCrawled)}</td>
                  <td className={cn(adminTableCell, "px-4 py-3 align-top font-mono")}>{formatNumber(j.productsExtracted)}</td>
                  <td className={cn(adminTableCell, "px-4 py-3 align-top font-mono text-xs text-admin-muted")}>
                    {formatDate(j.createdAt)}
                  </td>
                  <td className={cn(adminTableCell, "px-4 py-3 align-top font-mono text-xs text-admin-muted")}>
                    {formatDate(j.finishedAt)}
                  </td>
                  <td className={cn(adminTableCell, "px-4 py-3 align-top text-right")}>
                    <Link
                      href={`/admin/products/import/jobs/${encodeURIComponent(j.id)}`}
                      className={cn(adminSecondaryButton, "inline-flex text-xs", adminLink)}
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
