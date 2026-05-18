import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SectionEyebrowProps = {
  children: ReactNode;
  icon?: LucideIcon;
  className?: string;
};

export function SectionEyebrow({ children, icon: Icon, className }: SectionEyebrowProps) {
  return (
    <p className={cn("proc-eyebrow mb-3 flex items-center justify-center gap-2 sm:justify-start", className)}>
      {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden /> : null}
      <span>{children}</span>
    </p>
  );
}
