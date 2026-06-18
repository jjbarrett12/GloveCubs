/**
 * Admin Page Header Component
 *
 * Consistent page header with title, description, and optional actions.
 * Uses admin semantic tokens (scoped via data-admin-theme).
 */

import { cn } from "@/lib/utils";
import { adminEyebrow } from "@/components/admin/admin-theme-utils";
import { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumb?: { label: string; href?: string }[];
  className?: string;
  /** Accent eyebrow + section styling (catalog command center) */
  variant?: "default" | "dark";
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  className,
  variant = "default",
}: PageHeaderProps) {
  const accent = variant === "dark";
  return (
    <div className={cn("mb-6", className)}>
      {breadcrumb && breadcrumb.length > 0 && (
        <nav className="mb-2 flex" aria-label="Breadcrumb">
          <ol className="flex items-center gap-1 text-sm">
            {breadcrumb.map((item, i) => (
              <li key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-admin-muted">/</span>}
                {item.href ? (
                  <a href={item.href} className="text-admin-muted hover:text-admin-accent">
                    {item.label}
                  </a>
                ) : (
                  <span className="text-admin-primary">{item.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {accent ? <p className={adminEyebrow}>Catalog operations</p> : null}
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-admin-primary sm:text-[26px]">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-admin-secondary">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-shrink-0 flex-col items-stretch gap-2 sm:items-end">{actions}</div> : null}
      </div>
    </div>
  );
}

export function PageSection({
  title,
  description,
  actions,
  children,
  className,
  variant = "default",
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  variant?: "default" | "dark";
}) {
  const accent = variant === "dark";
  return (
    <section className={cn("mb-8", className)}>
      {(title || description || actions) && (
        <div
          className={cn(
            "mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between",
            accent && "border-b border-admin-border-subtle pb-3",
          )}
        >
          <div className="min-w-0">
            {title ? (
              <h2
                className={cn(
                  accent ? adminEyebrow : "text-base font-semibold text-admin-primary",
                )}
              >
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className={cn("text-sm", accent ? "mt-1 text-admin-secondary" : "mt-0.5 text-admin-muted")}>
                {description}
              </p>
            ) : null}
          </div>
          {actions ? <div className="flex flex-shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}
