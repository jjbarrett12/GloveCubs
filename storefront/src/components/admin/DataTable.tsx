"use client";

/**
 * Admin Data Table Component
 *
 * Reusable table with compact rows, click-to-select, loading/empty states.
 * Uses admin semantic tokens (scoped via data-admin-theme).
 */

import {
  adminCardSurface,
  adminTableBody,
  adminTableCell,
  adminTableHead,
  adminTableHeadCell,
  adminTableRowHover,
  adminTableRowSelected,
  adminTableShell,
} from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface Column<T> {
  key: string;
  header: string;
  width?: string;
  align?: "left" | "center" | "right";
  render?: (row: T, index: number) => ReactNode;
  className?: string;
  headerClassName?: string;
  mono?: boolean;
  truncate?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyField: keyof T;
  onRowClick?: (row: T) => void;
  selectedId?: string | number | null;
  loading?: boolean;
  emptyMessage?: string;
  emptyIcon?: ReactNode;
  compact?: boolean;
  stickyHeader?: boolean;
  className?: string;
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  keyField,
  onRowClick,
  selectedId,
  loading = false,
  emptyMessage = "No data found",
  emptyIcon,
  compact = true,
  stickyHeader = false,
  className,
}: DataTableProps<T>) {
  if (loading) {
    return <TableSkeleton columns={columns.length} rows={5} />;
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-admin-muted">
        {emptyIcon ? <div className="mb-3 text-admin-muted">{emptyIcon}</div> : null}
        <p className="text-sm text-admin-secondary">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className={adminTableShell}>
        <thead className={cn(adminTableHead, stickyHeader && "sticky top-0 z-10")}>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                style={{ width: col.width }}
                className={cn(
                  adminTableHeadCell,
                  compact ? "px-3 py-2" : "px-4 py-3",
                  col.align === "center" && "text-center",
                  col.align === "right" && "text-right",
                  col.headerClassName,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={adminTableBody}>
          {data.map((row, index) => {
            const key = row[keyField] as string | number;
            const isSelected = selectedId !== undefined && key === selectedId;

            return (
              <tr
                key={key}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  "transition-colors",
                  onRowClick && cn("cursor-pointer", adminTableRowHover),
                  isSelected && adminTableRowSelected,
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      adminTableCell,
                      compact ? "px-3 py-2" : "px-4 py-3",
                      col.align === "center" && "text-center",
                      col.align === "right" && "text-right",
                      col.mono && "font-mono text-xs text-admin-secondary",
                      col.truncate && "max-w-xs truncate",
                      col.className,
                    )}
                    title={col.truncate ? String(row[col.key] ?? "") : undefined}
                  >
                    {col.render ? col.render(row, index) : String(row[col.key] ?? "-")}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TableSkeleton({ columns, rows }: { columns: number; rows: number }) {
  return (
    <div className="animate-pulse">
      <div className="h-10 rounded-t bg-admin-surface-muted" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 border-b border-admin-border-subtle px-3 py-3">
          {Array.from({ length: columns }).map((_, j) => (
            <div key={j} className="h-4 flex-1 rounded bg-admin-surface-muted" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function TableCard({
  children,
  className,
  variant = "default",
}: {
  children: ReactNode;
  className?: string;
  /** @deprecated Theme follows data-admin-theme */
  variant?: "default" | "dark";
}) {
  void variant;
  return <div className={cn(adminCardSurface, "overflow-hidden", className)}>{children}</div>;
}

export function TableToolbar({
  children,
  className,
  variant = "default",
}: {
  children: ReactNode;
  className?: string;
  /** @deprecated Theme follows data-admin-theme */
  variant?: "default" | "dark";
}) {
  void variant;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-4 border-b border-admin-border-subtle bg-admin-surface-muted px-4 py-3 text-xs text-admin-muted",
        className,
      )}
    >
      {children}
    </div>
  );
}
