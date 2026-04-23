"use client";

/**
 * Admin Data Table Component
 * 
 * Reusable table with:
 * - Compact, scannable rows
 * - Click-to-select behavior
 * - Loading/empty states
 * - Responsive horizontal scroll
 */

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
      <div className="flex flex-col items-center justify-center py-12 text-gray-500">
        {emptyIcon && <div className="mb-3 text-gray-400">{emptyIcon}</div>}
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="min-w-full divide-y divide-gray-200">
        <thead className={cn("bg-gray-50", stickyHeader && "sticky top-0 z-10")}>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                style={{ width: col.width }}
                className={cn(
                  "text-left text-xs font-medium text-gray-500 uppercase tracking-wider",
                  compact ? "px-3 py-2" : "px-4 py-3",
                  col.align === "center" && "text-center",
                  col.align === "right" && "text-right",
                  col.headerClassName
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {data.map((row, index) => {
            const key = row[keyField] as string | number;
            const isSelected = selectedId !== undefined && key === selectedId;
            
            return (
              <tr
                key={key}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  "transition-colors",
                  onRowClick && "cursor-pointer hover:bg-blue-50",
                  isSelected && "bg-blue-50 ring-1 ring-inset ring-blue-200"
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      "text-sm text-gray-900",
                      compact ? "px-3 py-2" : "px-4 py-3",
                      col.align === "center" && "text-center",
                      col.align === "right" && "text-right",
                      col.mono && "font-mono text-xs",
                      col.truncate && "max-w-xs truncate",
                      col.className
                    )}
                    title={col.truncate ? String(row[col.key] ?? "") : undefined}
                  >
                    {col.render
                      ? col.render(row, index)
                      : String(row[col.key] ?? "-")}
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
      <div className="h-10 bg-gray-100 rounded-t" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 px-3 py-3 border-b border-gray-100">
          {Array.from({ length: columns }).map((_, j) => (
            <div key={j} className="h-4 bg-gray-100 rounded flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function TableCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden", className)}>
      {children}
    </div>
  );
}

export function TableToolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("px-4 py-3 border-b border-gray-200 flex items-center gap-4 flex-wrap", className)}>
      {children}
    </div>
  );
}
