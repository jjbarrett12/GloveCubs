import type { ReactNode } from "react";
import { adminCardSurface } from "@/components/admin/admin-theme-utils";
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
    <section className={cn(adminCardSurface, "rounded-xl", dense ? "p-3 sm:p-4" : "p-4 sm:p-5", className)}>
      {title || description ? (
        <header className={cn("border-b border-admin-border-subtle", dense ? "mb-3 pb-2.5" : "mb-4 pb-3")}>
          {title ? <h3 className="text-sm font-semibold tracking-tight text-admin-primary">{title}</h3> : null}
          {description ? (
            <p className="mt-1 text-xs leading-relaxed text-admin-muted">{description}</p>
          ) : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
