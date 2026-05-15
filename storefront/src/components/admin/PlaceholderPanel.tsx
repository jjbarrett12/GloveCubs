import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  children: ReactNode;
  className?: string;
};

/** Honest “coming soon” / disabled operational panel — no fake forms or CTAs. */
export function PlaceholderPanel({ title, children, className }: Props) {
  return (
    <div
      className={cn(
        "rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-4 text-sm text-slate-600 shadow-inner",
        className,
      )}
      role="region"
      aria-label={title}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <div className="mt-2 space-y-2 leading-snug">{children}</div>
    </div>
  );
}
