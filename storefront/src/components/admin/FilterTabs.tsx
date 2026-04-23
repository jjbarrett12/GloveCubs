"use client";

/**
 * Admin Filter Tabs Component
 * 
 * URL-based filter navigation for admin tables.
 * Supports both client-side state and server-side searchParams.
 */

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
    <div className={cn("flex items-center gap-1 flex-wrap", className)}>
      {options.map((option) => {
        const isActive = currentValue === option.value;
        return (
          <Link
            key={option.value}
            href={buildHref(option.value)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
              isActive
                ? "bg-gray-900 text-white"
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
            )}
          >
            {option.label}
            {option.count !== undefined && (
              <span
                className={cn(
                  "text-xs tabular-nums px-1.5 py-0.5 rounded-full",
                  isActive ? "bg-white/20" : "bg-gray-200/80"
                )}
              >
                {option.count}
              </span>
            )}
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
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">
        {label}:
      </span>
      {children}
    </div>
  );
}
