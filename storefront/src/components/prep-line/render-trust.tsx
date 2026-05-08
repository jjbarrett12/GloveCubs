"use client";

import * as React from "react";
import type { PrepLineCardFact } from "@/lib/prep-line/card-projection";
import { cn } from "@/lib/utils";

/** Catalog-truth region: listing-backed facts only. */
export function CatalogFactList({ facts, className }: { facts: PrepLineCardFact[]; className?: string }) {
  if (!facts.length) return null;
  return (
    <dl className={cn("space-y-1.5 rounded-lg border border-white/10 bg-black/20 px-3 py-2", className)}>
      {facts.map((f, i) => (
        <div key={`${f.label}:${i}:${f.value.slice(0, 24)}`} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-x-2 gap-y-0.5 text-[11px] leading-snug">
          <dt className="text-white/55">{f.label}</dt>
          <dd className="text-white/90">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Advisory / non-authoritative narrative (LLM or static guidance). */
export function AdvisoryTextBlock({
  title,
  children,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2 text-[11px] leading-relaxed text-amber-50/95",
        className
      )}
      aria-label={title ?? "Advisory note"}
    >
      {title ? <p className="mb-1 font-medium text-amber-100/90">{title}</p> : null}
      <div className="text-amber-50/90">{children}</div>
    </aside>
  );
}
