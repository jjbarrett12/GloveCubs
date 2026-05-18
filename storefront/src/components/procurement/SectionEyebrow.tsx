import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SectionEyebrowTone = "dark" | "light";

export type SectionEyebrowProps = {
  children: ReactNode;
  icon?: LucideIcon;
  className?: string;
  tone?: SectionEyebrowTone;
};

export function SectionEyebrow({ children, icon: Icon, className, tone = "dark" }: SectionEyebrowProps) {
  const isLight = tone === "light";

  return (
    <p
      className={cn(
        "mb-3 flex items-center justify-center gap-2 sm:justify-start",
        isLight ? "proc-eyebrow-light" : "proc-eyebrow",
        className
      )}
    >
      {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden /> : null}
      <span>{children}</span>
    </p>
  );
}
