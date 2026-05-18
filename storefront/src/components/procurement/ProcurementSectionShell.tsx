import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ProcurementSectionTone = "base" | "raised" | "card";

const toneClass: Record<ProcurementSectionTone, string> = {
  base: "bg-surface-base",
  raised: "bg-surface-raised",
  card: "bg-surface-card",
};

export type ProcurementSectionShellProps = {
  id?: string;
  tone?: ProcurementSectionTone;
  borderTop?: boolean;
  className?: string;
  containerClassName?: string;
  headingId?: string;
  ariaLabel?: string;
  children: ReactNode;
};

export function ProcurementSectionShell({
  id,
  tone = "raised",
  borderTop = true,
  className,
  containerClassName,
  headingId,
  ariaLabel,
  children,
}: ProcurementSectionShellProps) {
  return (
    <section
      id={id}
      className={cn(
        "scroll-mt-28 px-4 py-proc-section-y sm:px-6 sm:py-proc-section-y-lg lg:px-8",
        borderTop && "border-t border-border-subtle",
        toneClass[tone],
        className
      )}
      aria-labelledby={headingId}
      aria-label={ariaLabel}
    >
      <div className={cn("mx-auto max-w-proc", containerClassName)}>{children}</div>
    </section>
  );
}
