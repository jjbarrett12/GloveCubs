/**
 * Admin Page Header Component
 * 
 * Consistent page header with title, description, and optional actions
 */

import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumb?: { label: string; href?: string }[];
  className?: string;
  /** Dark surfaces (e.g. catalog command center) — keeps structure, adjusts text/breadcrumb colors only */
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
  const dark = variant === "dark";
  return (
    <div className={cn("mb-6", className)}>
      {breadcrumb && breadcrumb.length > 0 && (
        <nav className="flex mb-2" aria-label="Breadcrumb">
          <ol className="flex items-center gap-1 text-sm">
            {breadcrumb.map((item, i) => (
              <li key={i} className="flex items-center gap-1">
                {i > 0 && <span className={dark ? "text-neutral-600" : "text-gray-400"}>/</span>}
                {item.href ? (
                  <a
                    href={item.href}
                    className={dark ? "text-neutral-500 hover:text-[#f06232]" : "text-gray-500 hover:text-gray-700"}
                  >
                    {item.label}
                  </a>
                ) : (
                  <span className={dark ? "text-neutral-200" : "text-gray-900"}>{item.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {dark ? (
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#f06232]">Catalog operations</p>
          ) : null}
          <h1
            className={cn(
              dark
                ? "mt-1 text-2xl font-bold tracking-tight text-white sm:text-[26px]"
                : "text-2xl font-semibold tracking-tight text-slate-900 sm:text-[26px]",
            )}
          >
            {title}
          </h1>
          {description && (
            <p className={cn("text-sm leading-relaxed", dark ? "mt-2 max-w-3xl text-neutral-400" : "mt-2 max-w-3xl text-slate-600")}>
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex flex-shrink-0 flex-col items-stretch gap-2 sm:items-end">{actions}</div>}
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
  const dark = variant === "dark";
  return (
    <section className={cn("mb-8", className)}>
      {(title || description || actions) && (
        <div
          className={cn(
            "mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between",
            dark && "border-b border-white/10 pb-3",
          )}
        >
          <div className="min-w-0">
            {title ? (
              <h2
                className={cn(
                  dark
                    ? "text-xs font-bold uppercase tracking-[0.14em] text-[#f06232]"
                    : "text-base font-semibold text-gray-900",
                )}
              >
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className={cn("text-sm", dark ? "mt-1 text-neutral-400" : "mt-0.5 text-gray-500")}>{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex flex-shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}
