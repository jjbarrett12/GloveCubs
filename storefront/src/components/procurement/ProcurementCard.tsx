import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ProcurementCardProps = {
  children: ReactNode;
  className?: string;
  as?: "div" | "li" | "article";
};

export function ProcurementCard({ children, className, as: Tag = "div" }: ProcurementCardProps) {
  return (
    <Tag
      className={cn(
        "rounded-2xl border border-border-subtle bg-surface-card p-proc-card-p shadow-proc-sm transition-shadow sm:p-proc-card-p-lg",
        "hover:border-brand/30 hover:shadow-proc-sm",
        className
      )}
    >
      {children}
    </Tag>
  );
}
