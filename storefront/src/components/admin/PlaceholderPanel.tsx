import type { ReactNode } from "react";
import { adminBodyText, adminMutedPanel } from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  children: ReactNode;
  className?: string;
};

/** Honest “coming soon” / disabled operational panel — no fake forms or CTAs. */
export function PlaceholderPanel({ title, children, className }: Props) {
  return (
    <div className={cn(adminMutedPanel, "px-4 py-4 shadow-inner", className)} role="region" aria-label={title}>
      <p className="text-xs font-semibold uppercase tracking-wide text-admin-muted">{title}</p>
      <div className={cn("mt-2 space-y-2 leading-snug", adminBodyText)}>{children}</div>
    </div>
  );
}
