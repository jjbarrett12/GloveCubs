"use client";

import { cn } from "@/lib/utils";
import type { UseCaseOption } from "@/config/gloveFinder";

const TRANSITION = "transition-all duration-200";

interface UseCaseGridProps {
  options: UseCaseOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  className?: string;
}

export function UseCaseGrid({ options, selectedId, onSelect, className }: UseCaseGridProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4",
        className
      )}
    >
      {options.map((opt) => {
        const isSelected = selectedId === opt.id;
        const Icon = opt.Icon;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onSelect(opt.id)}
            className={cn(
              "flex flex-col items-start rounded-xl border p-4 text-left",
              TRANSITION,
              "hover:border-white/30 hover:shadow-md hover:-translate-y-0.5",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              isSelected
                ? "border-primary bg-primary/10 shadow-sm"
                : "border-white/10 bg-white/[0.03]"
            )}
          >
            <span
              className={cn(
                "mb-3 flex h-10 w-10 items-center justify-center rounded-lg",
                TRANSITION,
                isSelected ? "bg-primary/20 text-primary" : "bg-white/5 text-white/70"
              )}
            >
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <span className="text-sm font-semibold text-white">{opt.label}</span>
            <span className="mt-1 text-xs text-white/60 line-clamp-2">{opt.description}</span>
          </button>
        );
      })}
    </div>
  );
}
