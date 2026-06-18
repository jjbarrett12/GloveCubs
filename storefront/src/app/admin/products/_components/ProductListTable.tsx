"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProductImage } from "@/components/store/ProductImage";
import { StatusBadge } from "@/components/admin";
import type { AdminProductListRow } from "@/lib/admin/product-operations";
import { ProductListRowActions } from "@/app/admin/products/_components/ProductListRowActions";
import {
  adminAlertSurface,
  adminLink,
  adminMutedPanel,
  adminSecondaryButton,
  adminTableBody,
  adminTableCell,
  adminTableHead,
  adminTableHeadCell,
  adminTableRowHover,
} from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";

const deleteButton = cn(
  adminSecondaryButton,
  "border-admin-danger/40 text-admin-danger hover:bg-[var(--admin-danger-surface)]",
);

function healthLabel(row: AdminProductListRow): string {
  if (row.imageHealth === "missing") return "Missing";
  if (row.imageHealth === "placeholder_only") return "Placeholder";
  return "OK";
}

function pdpLabel(row: AdminProductListRow): string {
  if (row.pdpHealth === "n_a") return "—";
  if (row.pdpHealth === "thin") return "Thin";
  return "OK";
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export function ProductListTable({ rows }: { rows: AdminProductListRow[] }) {
  const router = useRouter();
  const rowIds = React.useMemo(() => rows.map((r) => r.id), [rows]);
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [bulkDeleting, setBulkDeleting] = React.useState(false);
  const [bulkError, setBulkError] = React.useState<string | null>(null);

  const allSelected = rowIds.length > 0 && rowIds.every((id) => selected.has(id));
  const someSelected = rowIds.some((id) => selected.has(id));

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      if (allSelected) {
        return new Set();
      }
      return new Set(rowIds);
    });
  }

  async function onBulkDelete() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const liveCount = rows.filter((r) => selected.has(r.id) && r.status === "active").length;
    const prompt =
      liveCount > 0
        ? `Delete ${ids.length} product${ids.length === 1 ? "" : "s"}? ${liveCount} ${liveCount === 1 ? "is" : "are"} live/enabled. This cannot be undone.`
        : `Delete ${ids.length} product${ids.length === 1 ? "" : "s"}? This cannot be undone.`;
    if (!window.confirm(prompt)) {
      return;
    }
    setBulkError(null);
    setBulkDeleting(true);
    try {
      const res = await fetch("/admin/api/products/delete-drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_ids: ids }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        deleted?: string[];
        failed?: Array<{ productId: string; error: string }>;
      };
      if (!res.ok) {
        setBulkError(data.error ?? `Delete failed (${res.status})`);
        return;
      }
      const failed = data.failed ?? [];
      if (failed.length > 0) {
        setBulkError(
          `Deleted ${data.deleted?.length ?? 0}; ${failed.length} failed: ${failed
            .slice(0, 2)
            .map((f) => f.error)
            .join("; ")}${failed.length > 2 ? "…" : ""}`,
        );
      } else {
        setSelected(new Set());
      }
      router.refresh();
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBulkDeleting(false);
    }
  }

  return (
    <div className="overflow-x-auto">
      {selected.size > 0 ? (
        <div className={cn(adminMutedPanel, "flex flex-wrap items-center gap-3 border-solid px-4 py-3 text-sm")}>
          <span className="font-medium text-admin-secondary">
            <span className="font-mono text-admin-primary">{selected.size}</span> selected
          </span>
          <button
            type="button"
            disabled={bulkDeleting}
            onClick={() => void onBulkDelete()}
            className={cn(deleteButton, "text-xs")}
          >
            {bulkDeleting ? "Deleting…" : "Delete selected"}
          </button>
          <button
            type="button"
            disabled={bulkDeleting}
            onClick={() => setSelected(new Set())}
            className="text-xs font-medium text-admin-muted hover:text-admin-primary"
          >
            Clear selection
          </button>
          {bulkError ? (
            <p role="alert" className={cn(adminAlertSurface("critical", "w-full text-sm"))}>
              {bulkError}
            </p>
          ) : null}
        </div>
      ) : null}

      <table className="min-w-[1100px] w-full border-collapse text-left text-sm">
        <thead className={cn(adminTableHead, "border-b border-admin-border")}>
          <tr>
            <th className={cn(adminTableHeadCell, "w-10 px-4 py-3")}>
              {rowIds.length > 0 ? (
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected && !allSelected;
                  }}
                  onChange={toggleAll}
                  aria-label="Select all products on this page"
                  className="rounded border-admin-border text-admin-accent focus:ring-admin-focus-ring"
                />
              ) : null}
            </th>
            <th className={cn(adminTableHeadCell, "px-4 py-3")}>Image</th>
            <th className={cn(adminTableHeadCell, "px-4 py-3")}>Product</th>
            <th className={cn(adminTableHeadCell, "px-4 py-3")}>Brand</th>
            <th className={cn(adminTableHeadCell, "px-4 py-3")}>Category</th>
            <th className={cn(adminTableHeadCell, "px-4 py-3")}>Status</th>
            <th className={cn(adminTableHeadCell, "px-4 py-3")}>Visible</th>
            <th className={cn(adminTableHeadCell, "px-4 py-3")}>Variants</th>
            <th className={cn(adminTableHeadCell, "px-4 py-3")}>Images</th>
            <th className={cn(adminTableHeadCell, "px-4 py-3")}>PDP</th>
            <th className={cn(adminTableHeadCell, "px-4 py-3")}>Quote</th>
            <th className={cn(adminTableHeadCell, "px-4 py-3")}>Updated</th>
            <th className={cn(adminTableHeadCell, "px-4 py-3")}>Warnings</th>
            <th className={cn(adminTableHeadCell, "px-4 py-3 text-right")}>Actions</th>
          </tr>
        </thead>
        <tbody className={adminTableBody}>
          {rows.map((row) => (
            <tr key={row.id} className={cn(adminTableRowHover, "transition-colors")}>
              <td className={cn(adminTableCell, "px-4 py-3 align-middle")}>
                <input
                  type="checkbox"
                  checked={selected.has(row.id)}
                  onChange={() => toggleOne(row.id)}
                  aria-label={`Select ${row.name}`}
                  className="rounded border-admin-border text-admin-accent focus:ring-admin-focus-ring"
                />
              </td>
              <td className={cn(adminTableCell, "px-4 py-3 align-middle")}>
                <Link href={`/admin/products/${row.id}`} className="block w-16 shrink-0">
                  <ProductImage
                    src={row.primaryImageUrl}
                    alt={row.name}
                    containerClassName="!rounded-lg !border !border-admin-border !bg-admin-surface-muted"
                    loading="lazy"
                  />
                </Link>
              </td>
              <td className={cn(adminTableCell, "px-4 py-3 align-top")}>
                <Link href={`/admin/products/${row.id}`} className={cn("font-semibold", adminLink)}>
                  {row.name}
                </Link>
                <div className="mt-0.5 font-mono text-xs text-admin-muted">{row.id}</div>
              </td>
              <td className={cn(adminTableCell, "px-4 py-3 align-top text-admin-secondary")}>{row.brandName ?? "—"}</td>
              <td className={cn(adminTableCell, "px-4 py-3 align-top text-admin-secondary")}>{row.categoryName ?? "—"}</td>
              <td className={cn(adminTableCell, "px-4 py-3 align-top")}>
                <StatusBadge
                  status={row.status === "active" ? "enabled" : row.status === "archived" ? "disabled" : "pending"}
                />
              </td>
              <td className={cn(adminTableCell, "px-4 py-3 align-top text-admin-secondary")}>
                {row.storefrontVisible ? "Yes" : "No"}
              </td>
              <td className={cn(adminTableCell, "px-4 py-3 align-top font-mono text-admin-primary")}>
                {row.activeVariantCount}
              </td>
              <td className={cn(adminTableCell, "px-4 py-3 align-top text-admin-secondary")}>
                {healthLabel(row)}
                <span className="text-admin-muted"> ({row.imageCount})</span>
              </td>
              <td className={cn(adminTableCell, "px-4 py-3 align-top text-admin-secondary")}>{pdpLabel(row)}</td>
              <td className={cn(adminTableCell, "px-4 py-3 align-top text-admin-secondary")}>
                {row.quoteEnabled ? "Yes" : "No"}
              </td>
              <td className={cn(adminTableCell, "px-4 py-3 align-top font-mono text-xs text-admin-muted")}>
                {formatWhen(row.updatedAt)}
              </td>
              <td className={cn(adminTableCell, "px-4 py-3 align-top")}>
                <span className="font-mono text-sm font-medium text-admin-primary">{row.warnings.length}</span>
                {row.warnings.length > 0 ? (
                  <ul className="mt-1.5 max-w-[220px] list-inside list-disc text-xs leading-relaxed text-admin-warning">
                    {row.warnings.slice(0, 3).map((w) => (
                      <li key={w.code}>{w.label}</li>
                    ))}
                    {row.warnings.length > 3 ? <li>…</li> : null}
                  </ul>
                ) : null}
              </td>
              <td className={cn(adminTableCell, "px-4 py-3 align-top text-right")}>
                <ProductListRowActions productId={row.id} status={row.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
