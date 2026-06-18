"use client";

/**
 * Admin Filter Tabs Component
 *
 * URL-based filter navigation for admin tables.
 */

import { adminFocusRing } from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

interface FilterTabsProps {
  paramName: string;
  options: FilterOption[];
  defaultValue?: string;
  baseHref?: string;
  preserveParams?: string[];
  className?: string;
}

export function FilterTabs({
  paramName,
  options,
  defaultValue = "all",
  baseHref,
  preserveParams = [],
  className,
}: FilterTabsProps) {
  const searchParams = useSearchParams();
  const currentValue = searchParams.get(paramName) || defaultValue;

  const buildHref = (value: string) => {
    const params = new URLSearchParams();

    preserveParams.forEach((key) => {
      const val = searchParams.get(key);
      if (val) params.set(key, val);
    });

    if (value !== defaultValue) {
      params.set(paramName, value);
    }

    const query = params.toString();
    const base = baseHref || "";
    return query ? `${base}?${query}` : base || "?";
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {options.map((option) => {
        const isActive = currentValue === option.value;
        return (
          <Link
            key={option.value}
            href={buildHref(option.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              adminFocusRing(),
              isActive
                ? "bg-admin-accent text-white shadow-sm"
                : "text-admin-secondary hover:bg-admin-surface-muted hover:text-admin-primary",
            )}
          >
            {option.label}
            {option.count !== undefined ? (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-xs tabular-nums",
                  isActive ? "bg-white/20 text-white" : "bg-admin-surface-muted text-admin-muted",
                )}
              >
                {option.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}

export function FilterGroup({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="whitespace-nowrap text-xs font-medium uppercase tracking-wide text-admin-muted">{label}:</span>
      {children}
    </div>
  );
}
