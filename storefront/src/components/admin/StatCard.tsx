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
  /** Dark command-center surfaces */
  variant?: "default" | "dark";
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

const COLORS_DARK: typeof COLORS = {
  default: {
    text: "text-neutral-100",
    accent: "border-l-neutral-500",
    icon: "text-neutral-500",
  },
  blue: {
    text: "text-sky-400",
    accent: "border-l-sky-500",
    icon: "text-sky-400",
  },
  green: {
    text: "text-emerald-400",
    accent: "border-l-emerald-500",
    icon: "text-emerald-400",
  },
  amber: {
    text: "text-amber-400",
    accent: "border-l-amber-500",
    icon: "text-amber-400",
  },
  red: {
    text: "text-red-400",
    accent: "border-l-red-500",
    icon: "text-red-400",
  },
  purple: {
    text: "text-purple-400",
    accent: "border-l-purple-500",
    icon: "text-purple-400",
  },
  orange: {
    text: "text-[#f06232]",
    accent: "border-l-[#f06232]",
    icon: "text-[#f06232]",
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
  variant = "default",
}: StatCardProps) {
  const dark = variant === "dark";
  const palette = dark ? COLORS_DARK : COLORS;
  const colors = palette[color];
  const isInteractive = !!href || !!onClick;

  const content = (
    <div
      className={cn(
        "rounded-lg border p-4 transition-all",
        dark ? "border-white/10 bg-[#161616] ring-1 ring-white/[0.03]" : "border-gray-200 bg-white",
        accentBorder && `border-l-4 ${colors.accent}`,
        isInteractive && (dark ? "cursor-pointer hover:border-white/20 hover:bg-[#1c1c1c]" : "cursor-pointer hover:border-gray-300 hover:shadow-md"),
        className,
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className={cn("text-xs font-medium uppercase tracking-wide truncate", dark ? "text-neutral-500" : "text-gray-500")}>
            {label}
          </p>
          <p className={cn("mt-1 text-2xl font-semibold tabular-nums", colors.text)}>
            {value}
          </p>
          {trend && (
            <p
              className={cn(
                "mt-1 text-xs font-medium",
                trend.value > 0
                  ? dark
                    ? "text-emerald-400"
                    : "text-emerald-600"
                  : trend.value < 0
                    ? dark
                      ? "text-red-400"
                      : "text-red-600"
                    : dark
                      ? "text-neutral-500"
                      : "text-gray-500",
              )}
            >
              {trend.value > 0 ? "\u2191" : trend.value < 0 ? "\u2193" : "\u2192"} {Math.abs(trend.value)}%
              {trend.label && <span className={cn("ml-1", dark ? "text-neutral-600" : "text-gray-400")}>{trend.label}</span>}
            </p>
          )}
        </div>
        {icon && (
          <div className={cn("ml-3 flex-shrink-0", colors.icon)}>
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
