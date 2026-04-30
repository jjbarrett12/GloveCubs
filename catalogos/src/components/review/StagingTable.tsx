"use client";

import { useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import type { StagingRow } from "@/lib/review/data";
import { getStagingSizeDisplay, getStagingSourceTitle, getVariantSkuDisplay } from "@/lib/review/staging-review-evidence";
import { cn } from "@/lib/utils";

function StatusBadge({ status }: { status: string }) {
  const v = status === "approved" || status === "merged" ? "success" : status === "rejected" ? "destructive" : "secondary";
  return <Badge variant={v}>{status}</Badge>;
}

export interface StagingTableProps {
  rows: StagingRow[];
  onRowClick?: (id: string) => void;
  /** When set, show checkboxes and selection. Parent controls selectedIds and receives changes. */
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  /** Optional: mark rows that are not publishable (e.g. missing required attrs). */
  getBlocked?: (row: StagingRow) => boolean;
}

export function StagingTable({ rows, onRowClick, selectedIds, onSelectionChange, getBlocked }: StagingTableProps) {
  const selectAllRef = useRef<HTMLInputElement>(null);
  const isSelectable = selectedIds !== undefined && onSelectionChange !== undefined;

  useEffect(() => {
    if (!isSelectable || !selectAllRef.current || rows.length === 0) return;
    const el = selectAllRef.current;
    const n = selectedIds!.size;
    el.indeterminate = n > 0 && n < rows.length;
  }, [isSelectable, selectedIds, rows.length]);

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-12 text-center text-muted-foreground">
        <p className="font-medium">No staged products match the current filters.</p>
        <p className="text-sm mt-1">Adjust filters or run an import to see records here.</p>
      </div>
    );
  }

  function toggleRow(id: string) {
    if (!onSelectionChange || !selectedIds) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  }

  function toggleSelectAll() {
    if (!onSelectionChange || !selectedIds) return;
    if (selectedIds.size === rows.length) onSelectionChange(new Set());
    else onSelectionChange(new Set(rows.map((r) => r.id)));
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {isSelectable && (
                <th className="w-10 p-2">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={rows.length > 0 && selectedIds!.size === rows.length}
                    onChange={toggleSelectAll}
                    aria-label="Select all rows"
                  />
                </th>
              )}
              <th className="text-left p-3 font-medium">Supplier</th>
              <th className="text-left p-3 font-medium">SKU</th>
              <th className="text-left p-3 font-medium">Source title</th>
              <th className="text-left p-3 font-medium">Variant SKU</th>
              <th className="text-left p-3 font-medium">Size</th>
              <th className="text-left p-3 font-medium">Normalized</th>
              <th className="text-left p-3 font-medium">Attributes</th>
              <th className="text-left p-3 font-medium">Match</th>
              <th className="text-left p-3 font-medium">Conf.</th>
              <th className="text-left p-3 font-medium">Cost</th>
              <th className="text-left p-3 font-medium">Sell</th>
              <th className="text-left p-3 font-medium">Anomalies</th>
              <th className="text-left p-3 font-medium">Status</th>
              {getBlocked && <th className="text-left p-3 font-medium">Publish</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const nd = r.normalized_data ?? {};
              const attrs = (r.attributes ?? {}) as Record<string, unknown>;
              const sourceTitle = getStagingSourceTitle(nd as Record<string, unknown>);
              const variantSku = getVariantSkuDisplay(nd as Record<string, unknown>, attrs);
              const sizeDisplay = getStagingSizeDisplay(r.inferred_size, attrs);
              const anomalyCount = (nd.anomaly_flags as unknown[])?.length ?? 0;
              const blocked = getBlocked?.(r) ?? false;
              return (
                <tr
                  key={r.id}
                  className={cn(
                    "border-b border-border hover:bg-muted/40 transition-colors",
                    onRowClick && "cursor-pointer"
                  )}
                  onClick={(e) => { if (!(e.target as HTMLElement).closest('input[type="checkbox"]')) onRowClick?.(r.id); }}
                >
                  {isSelectable && (
                    <td className="p-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds!.has(r.id)}
                        onChange={() => toggleRow(r.id)}
                        aria-label={`Select row ${r.id}`}
                      />
                    </td>
                  )}
                  <td className="p-3 max-w-[120px] truncate" title={r.supplier_name ?? r.supplier_id}>{r.supplier_name ?? r.supplier_id.slice(0, 8)}</td>
                  <td className="p-3 font-mono text-xs">{nd.sku ?? "—"}</td>
                  <td className="p-3 max-w-[160px] truncate text-muted-foreground" title={sourceTitle}>
                    {sourceTitle}
                  </td>
                  <td className="p-3 max-w-[120px] truncate font-mono text-xs" title={variantSku}>
                    {variantSku}
                  </td>
                  <td className="p-3 max-w-[72px] truncate text-xs" title={sizeDisplay}>
                    {sizeDisplay}
                  </td>
                  <td className="p-3 max-w-[160px] truncate font-medium">{nd.name ?? "—"}</td>
                  <td className="p-3 max-w-[140px]">
                    <span className="text-muted-foreground text-xs">
                      {r.attributes && typeof r.attributes === "object"
                        ? [r.attributes.material, r.attributes.color, r.attributes.size].filter(Boolean).slice(0, 3).join(", ") || "—"
                        : "—"}
                    </span>
                  </td>
                  <td className="p-3 max-w-[120px] truncate text-xs">{r.master_name ?? r.master_sku ?? "—"}</td>
                  <td className="p-3">
                    {r.match_confidence != null ? (
                      <span className={r.match_confidence >= 0.6 ? "text-emerald-400" : "text-amber-400"}>{(r.match_confidence * 100).toFixed(0)}%</span>
                    ) : "—"}
                  </td>
                  <td className="p-3 tabular-nums">{(nd.cost as number) != null ? `$${Number(nd.cost).toFixed(2)}` : "—"}</td>
                  <td className="p-3 tabular-nums">{r.sell_price != null ? `$${r.sell_price.toFixed(2)}` : "—"}</td>
                  <td className="p-3">
                    {anomalyCount > 0 ? <Badge variant="warning">{anomalyCount}</Badge> : "—"}
                  </td>
                  <td className="p-3"><StatusBadge status={r.status} /></td>
                  {getBlocked && (
                    <td className="p-3">
                      {blocked ? (
                        <Badge variant="destructive" className="text-xs">Blocked</Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">OK</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
