/**
 * Admin Stat Card Component
 *
 * Compact metric display for dashboard summaries.
 * Uses admin semantic tokens (scoped via data-admin-theme).
 */

import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: number | string;
  icon?: ReactNode;
  color?: "default" | "blue" | "green" | "amber" | "red" | "purple" | "orange";
  trend?: { value: number; label?: string };
  href?: string;
  onClick?: () => void;
  className?: string;
  accentBorder?: boolean;
  /** @deprecated Prefer admin theme tokens; kept for compatibility */
  variant?: "default" | "dark";
}

const VALUE_COLORS = {
  default: "text-admin-primary",
  blue: "text-admin-info",
  green: "text-admin-success",
  amber: "text-admin-warning",
  red: "text-admin-danger",
  purple: "text-admin-info",
  orange: "text-admin-accent",
};

const ACCENT_BORDERS = {
  default: "border-l-admin-muted",
  blue: "border-l-admin-info",
  green: "border-l-admin-success",
  amber: "border-l-admin-warning",
  red: "border-l-admin-danger",
  purple: "border-l-admin-info",
  orange: "border-l-admin-accent",
};

const ICON_COLORS = {
  default: "text-admin-muted",
  blue: "text-admin-info",
  green: "text-admin-success",
  amber: "text-admin-warning",
  red: "text-admin-danger",
  purple: "text-admin-info",
  orange: "text-admin-accent",
};

export function StatCard({
  label,
  value,
  icon,
  color = "default",
  trend,
  href,
  onClick,
  className,
  accentBorder = false,
}: StatCardProps) {
  const isInteractive = !!href || !!onClick;

  const content = (
    <div
      className={cn(
        "rounded-lg border border-admin-border bg-admin-surface p-4 ring-1 ring-admin-border-subtle transition-all",
        accentBorder && `border-l-4 ${ACCENT_BORDERS[color]}`,
        isInteractive && "cursor-pointer hover:border-admin-border hover:bg-admin-surface-muted",
        className,
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-admin-muted">{label}</p>
          <p className={cn("mt-1 text-2xl font-semibold tabular-nums", VALUE_COLORS[color])}>{value}</p>
          {trend ? (
            <p
              className={cn(
                "mt-1 text-xs font-medium",
                trend.value > 0
                  ? "text-admin-success"
                  : trend.value < 0
                    ? "text-admin-danger"
                    : "text-admin-muted",
              )}
            >
              {trend.value > 0 ? "\u2191" : trend.value < 0 ? "\u2193" : "\u2192"} {Math.abs(trend.value)}%
              {trend.label ? <span className="ml-1 text-admin-muted">{trend.label}</span> : null}
            </p>
          ) : null}
        </div>
        {icon ? <div className={cn("ml-3 flex-shrink-0", ICON_COLORS[color])}>{icon}</div> : null}
      </div>
    </div>
  );

  if (href) {
    return <a href={href}>{content}</a>;
  }

  return content;
}

export function StatGrid({
  children,
  columns = 4,
  className,
}: {
  children: ReactNode;
  columns?: 2 | 3 | 4 | 5 | 6;
  className?: string;
}) {
  const colClass = {
    2: "grid-cols-2",
    3: "grid-cols-3",
    4: "grid-cols-2 md:grid-cols-4",
    5: "grid-cols-2 md:grid-cols-5",
    6: "grid-cols-3 md:grid-cols-6",
  };

  return (
    <div className={cn("grid gap-4", colClass[columns], className)}>
      {children}
    </div>
  );
}
