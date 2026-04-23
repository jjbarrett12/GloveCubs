"use client";

import Link from "next/link";
import { useCallback } from "react";
import { INDUSTRY_OPTIONS, type IndustryKey } from "@/lib/conversion";
import { buildCatalogSearchString } from "@/lib/catalog/params";
import type { StorefrontFilterParams } from "@/lib/catalog/types";
import { trackConversionEvent } from "@/lib/conversion/analytics";
import { cn } from "@/lib/utils";

interface IndustryQuickSelectProps {
  basePath: string;
  selectedParams: StorefrontFilterParams;
  currentIndustryKey: IndustryKey | null;
  className?: string;
}

export function IndustryQuickSelect({
  basePath,
  selectedParams,
  currentIndustryKey,
  className,
}: IndustryQuickSelectProps) {
  const handleSelect = useCallback(
    (key: IndustryKey | null) => {
      trackConversionEvent("industry_selected", {
        industry: key,
        category: selectedParams.category,
      });
    },
    [selectedParams.category]
  );

  return (
    <div className={cn("w-full overflow-x-auto border-b border-border bg-muted/30 py-2", className)}>
      <div className="flex min-w-0 gap-1 px-2">
        <span className="mr-2 shrink-0 self-center text-xs font-medium text-muted-foreground">
          Industry:
        </span>
        <Link
          href={basePath + buildCatalogSearchString(selectedParams, { industry_quick: undefined, page: 1 })}
          onClick={() => handleSelect(null)}
          className={cn(
            "shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
            !currentIndustryKey
              ? "bg-primary text-primary-foreground"
              : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          All
        </Link>
        {INDUSTRY_OPTIONS.map((opt) => {
          const isSelected = currentIndustryKey === opt.key;
          const href =
            basePath +
            buildCatalogSearchString(selectedParams, { industry_quick: opt.key, page: 1 });
          return (
            <Link
              key={opt.key}
              href={href}
              onClick={() => handleSelect(opt.key)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {opt.shortLabel}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
