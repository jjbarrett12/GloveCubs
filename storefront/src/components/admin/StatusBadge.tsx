/**
 * Admin Status Badge Component
 *
 * Semantic status display — theme-safe in dark and light admin modes.
 */

import { adminStatusBadgeClasses, adminStatusTone, adminTypeBadgeClasses } from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";

export type StatusVariant =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "blocked"
  | "cancelled"
  | "open"
  | "in_review"
  | "approved"
  | "rejected"
  | "resolved"
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "enabled"
  | "disabled"
  | "success"
  | "warning"
  | "error"
  | "info"
  | "neutral";

function dotColorClass(status: string): string {
  const tone = adminStatusTone(status);
  if (tone === "success") return "bg-admin-success";
  if (tone === "warning") return "bg-admin-warning";
  if (tone === "danger") return "bg-admin-danger";
  if (tone === "info") return "bg-admin-info";
  if (status === "running") return "bg-admin-info animate-pulse";
  return "bg-current";
}

interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md";
  className?: string;
  dot?: boolean;
}

export function StatusBadge({ status, size = "sm", className, dot = false }: StatusBadgeProps) {
  const tone = adminStatusTone(status);
  const label = status.replace(/_/g, " ");

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md font-medium capitalize",
        size === "sm" ? "px-1.5 py-0.5 text-xs" : "px-2 py-1 text-sm",
        adminStatusBadgeClasses(tone),
        className,
      )}
    >
      {dot ? <span className={cn("h-1.5 w-1.5 rounded-full", dotColorClass(status))} /> : null}
      {label}
    </span>
  );
}

export function TypeBadge({ type, className }: { type: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium capitalize",
        adminTypeBadgeClasses(type),
        className,
      )}
    >
      {type.replace(/_/g, " ")}
    </span>
  );
}
