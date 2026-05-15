import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  /** Tighter padding for dense operational blocks */
  dense?: boolean;
};

export function PremiumSectionCard({ title, description, children, className, dense }: Props) {
  return (
    <section
      className={cn(
        "rounded-xl border border-slate-200/90 bg-white shadow-sm",
        dense ? "p-3 sm:p-4" : "p-4 sm:p-5",
        className,
      )}
    >
      {(title || description) && (
        <header className={cn("border-b border-slate-100", dense ? "mb-3 pb-2.5" : "mb-4 pb-3")}>
          {title ? <h3 className="text-sm font-semibold tracking-tight text-slate-900">{title}</h3> : null}
          {description ? <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p> : null}
        </header>
      )}
      {children}
    </section>
  );
}
