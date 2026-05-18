import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ProcurementSectionTone = "base" | "raised" | "card" | "light" | "light-alt";

const toneClass: Record<ProcurementSectionTone, string> = {
  base: "bg-surface-base",
  raised: "bg-surface-raised",
  card: "bg-surface-card",
  light: "bg-white text-neutral-900",
  "light-alt": "bg-[#fafafa] text-neutral-900",
};

const toneBorderClass: Record<ProcurementSectionTone, string> = {
  base: "border-border-subtle",
  raised: "border-border-subtle",
  card: "border-border-subtle",
  light: "border-border-light",
  "light-alt": "border-border-light",
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
  const isLight = tone === "light" || tone === "light-alt";

  return (
    <section
      id={id}
      className={cn(
        "scroll-mt-28 px-4 py-proc-section-y sm:px-6 sm:py-proc-section-y-lg lg:px-8",
        borderTop && cn("border-t", toneBorderClass[tone]),
        toneClass[tone],
        className
      )}
      aria-labelledby={headingId}
      aria-label={ariaLabel}
      data-proc-tone={isLight ? "light" : "dark"}
    >
      <div className={cn("mx-auto max-w-proc", containerClassName)}>{children}</div>
    </section>
  );
}
