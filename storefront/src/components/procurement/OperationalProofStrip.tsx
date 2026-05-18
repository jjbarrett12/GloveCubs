import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type OperationalProofItem = {
  label: string;
  icon?: LucideIcon;
};

export type OperationalProofStripProps = {
  items: readonly OperationalProofItem[];
  className?: string;
};

export function OperationalProofStrip({ items, className }: OperationalProofStripProps) {
  return (
    <ul
      className={cn(
        "flex flex-wrap justify-center gap-3 sm:justify-start",
        className
      )}
      aria-label="Operational proof"
    >
      {items.map(({ label, icon: Icon }) => (
        <li
          key={label}
          className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/80"
        >
          {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden /> : null}
          {label}
        </li>
      ))}
    </ul>
  );
}
