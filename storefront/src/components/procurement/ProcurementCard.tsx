import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ProcurementCardVariant = "dark" | "light";

export type ProcurementCardProps = {
  children: ReactNode;
  className?: string;
  as?: "div" | "li" | "article";
  variant?: ProcurementCardVariant;
};

export function ProcurementCard({
  children,
  className,
  as: Tag = "div",
  variant = "dark",
}: ProcurementCardProps) {
  const isLight = variant === "light";

  return (
    <Tag
      className={cn(
        "rounded-xl border p-proc-card-p transition-shadow sm:p-proc-card-p-lg",
        isLight
          ? "border-border-light bg-white shadow-proc-light-sm hover:border-brand/35 hover:shadow-proc-light-md"
          : "border-border-subtle bg-surface-card shadow-proc-sm hover:border-brand/30 hover:shadow-proc-sm",
        className
      )}
    >
      {children}
    </Tag>
  );
}
