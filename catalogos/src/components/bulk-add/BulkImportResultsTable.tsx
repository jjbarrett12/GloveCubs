"use client";

import Link from "next/link";
import type { BulkCsvImportRowResult } from "@/app/actions/bulk-csv-add";

export function BulkImportResultsTable({ results }: { results: BulkCsvImportRowResult[] }) {
  if (results.length === 0) return null;

  return (
    <div className="rounded-md border border-border overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left">
            <th className="px-3 py-2 font-medium">SKU</th>
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Category slug</th>
            <th className="px-3 py-2 font-medium w-[1%] whitespace-nowrap">Action</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, idx) => (
            <tr key={idx} className="border-b border-border last:border-0">
              <td className="px-3 py-2 font-mono text-xs">{r.sku || "—"}</td>
              <td className="px-3 py-2 max-w-xs truncate" title={r.name}>
                {r.name || "—"}
              </td>
              <td className="px-3 py-2 font-mono text-xs">{r.category_slug || "—"}</td>
              <td className="px-3 py-2">
                {r.error ? (
                  <span className="text-destructive text-xs">{r.error}</span>
                ) : r.normalizedId ? (
                  <Link
                    href={`/dashboard/products/quick-add?id=${encodeURIComponent(r.normalizedId)}`}
                    className="text-primary underline-offset-4 hover:underline text-xs whitespace-nowrap"
                  >
                    Open in Quick Add
                  </Link>
                ) : (
                  <span className="text-muted-foreground text-xs">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
