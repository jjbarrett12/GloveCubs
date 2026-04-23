/**
 * Admin Status Badge Component
 * 
 * Consistent status display across all admin pages
 */

import { cn } from "@/lib/utils";

export type StatusVariant = 
  | "pending" | "running" | "completed" | "failed" | "blocked" | "cancelled"
  | "open" | "in_review" | "approved" | "rejected" | "resolved"
  | "critical" | "high" | "medium" | "low"
  | "enabled" | "disabled"
  | "success" | "warning" | "error" | "info" | "neutral";

const STATUS_STYLES: Record<string, string> = {
  // Job statuses
  pending: "bg-amber-50 text-amber-700 ring-amber-600/20",
  running: "bg-blue-50 text-blue-700 ring-blue-600/20",
  completed: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  failed: "bg-red-50 text-red-700 ring-red-600/20",
  blocked: "bg-purple-50 text-purple-700 ring-purple-600/20",
  cancelled: "bg-gray-50 text-gray-600 ring-gray-500/20",
  
  // Review statuses
  open: "bg-amber-50 text-amber-700 ring-amber-600/20",
  in_review: "bg-blue-50 text-blue-700 ring-blue-600/20",
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  rejected: "bg-red-50 text-red-700 ring-red-600/20",
  resolved: "bg-gray-50 text-gray-600 ring-gray-500/20",
  
  // Priority levels
  critical: "bg-red-100 text-red-800 ring-red-600/30",
  high: "bg-orange-50 text-orange-700 ring-orange-600/20",
  medium: "bg-yellow-50 text-yellow-700 ring-yellow-500/20",
  low: "bg-green-50 text-green-700 ring-green-600/20",
  
  // Toggle states
  enabled: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  disabled: "bg-gray-50 text-gray-600 ring-gray-500/20",
  
  // Generic
  success: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  warning: "bg-amber-50 text-amber-700 ring-amber-600/20",
  error: "bg-red-50 text-red-700 ring-red-600/20",
  info: "bg-blue-50 text-blue-700 ring-blue-600/20",
  neutral: "bg-gray-50 text-gray-600 ring-gray-500/20",
};

interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md";
  className?: string;
  dot?: boolean;
}

export function StatusBadge({ status, size = "sm", className, dot = false }: StatusBadgeProps) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.neutral;
  const label = status.replace(/_/g, " ");
  
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md ring-1 ring-inset font-medium capitalize",
        size === "sm" ? "px-1.5 py-0.5 text-xs" : "px-2 py-1 text-sm",
        style,
        className
      )}
    >
      {dot && (
        <span className={cn(
          "h-1.5 w-1.5 rounded-full",
          status === "running" && "animate-pulse",
          status === "critical" && "bg-red-500",
          status === "high" && "bg-orange-500",
          status === "medium" && "bg-yellow-500",
          status === "low" && "bg-green-500",
          status === "running" && "bg-blue-500",
          status === "pending" && "bg-amber-500",
          !["critical", "high", "medium", "low", "running", "pending"].includes(status) && "bg-current"
        )} />
      )}
      {label}
    </span>
  );
}

export function TypeBadge({ type, className }: { type: string; className?: string }) {
  const TYPE_STYLES: Record<string, string> = {
    supplier: "bg-violet-50 text-violet-700 ring-violet-600/20",
    catalog: "bg-sky-50 text-sky-700 ring-sky-600/20",
    product_match: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
    pricing: "bg-teal-50 text-teal-700 ring-teal-600/20",
    audit: "bg-pink-50 text-pink-700 ring-pink-600/20",
    system: "bg-slate-50 text-slate-600 ring-slate-500/20",
  };
  
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset capitalize",
        TYPE_STYLES[type] || "bg-gray-50 text-gray-600 ring-gray-500/20",
        className
      )}
    >
      {type.replace(/_/g, " ")}
    </span>
  );
}
