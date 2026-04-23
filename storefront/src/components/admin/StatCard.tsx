/**
 * Admin Stat Card Component
 * 
 * Compact metric display for dashboard summaries
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
}

const COLORS = {
  default: {
    text: "text-gray-900",
    accent: "border-l-gray-400",
    icon: "text-gray-400",
  },
  blue: {
    text: "text-blue-600",
    accent: "border-l-blue-500",
    icon: "text-blue-500",
  },
  green: {
    text: "text-emerald-600",
    accent: "border-l-emerald-500",
    icon: "text-emerald-500",
  },
  amber: {
    text: "text-amber-600",
    accent: "border-l-amber-500",
    icon: "text-amber-500",
  },
  red: {
    text: "text-red-600",
    accent: "border-l-red-500",
    icon: "text-red-500",
  },
  purple: {
    text: "text-purple-600",
    accent: "border-l-purple-500",
    icon: "text-purple-500",
  },
  orange: {
    text: "text-orange-600",
    accent: "border-l-orange-500",
    icon: "text-orange-500",
  },
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
  const colors = COLORS[color];
  const isInteractive = !!href || !!onClick;

  const content = (
    <div
      className={cn(
        "bg-white rounded-lg border border-gray-200 p-4 transition-all",
        accentBorder && `border-l-4 ${colors.accent}`,
        isInteractive && "hover:shadow-md hover:border-gray-300 cursor-pointer",
        className
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide truncate">
            {label}
          </p>
          <p className={cn("mt-1 text-2xl font-semibold tabular-nums", colors.text)}>
            {value}
          </p>
          {trend && (
            <p className={cn(
              "mt-1 text-xs font-medium",
              trend.value > 0 ? "text-emerald-600" : trend.value < 0 ? "text-red-600" : "text-gray-500"
            )}>
              {trend.value > 0 ? "↑" : trend.value < 0 ? "↓" : "→"} {Math.abs(trend.value)}%
              {trend.label && <span className="text-gray-400 ml-1">{trend.label}</span>}
            </p>
          )}
        </div>
        {icon && (
          <div className={cn("flex-shrink-0 ml-3", colors.icon)}>
            {icon}
          </div>
        )}
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
