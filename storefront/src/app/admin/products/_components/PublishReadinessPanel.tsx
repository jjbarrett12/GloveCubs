"use client";

import { PremiumSectionCard } from "@/components/admin/PremiumSectionCard";
import { adminAlertSurface } from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";
import type { EditorReadinessResult } from "@/lib/admin/product-editor-readiness";

type Props = {
  readiness: EditorReadinessResult;
};

export function PublishReadinessPanel({ readiness }: Props) {
  const { warnings, publishBlockers } = readiness;

  return (
    <PremiumSectionCard title="Publish readiness" dense>
      {publishBlockers.length === 0 && warnings.length === 0 ? (
        <p className={cn(adminAlertSurface("success", "border-0 px-3 py-2 font-medium"))}>
          All checks passed — ready when you publish.
        </p>
      ) : (
        <div className="space-y-3 text-sm">
          {publishBlockers.length > 0 ? (
            <div className={adminAlertSurface("critical")}>
              <p className="text-[11px] font-bold uppercase tracking-wide">Publish blockers</p>
              <ul className="mt-1.5 space-y-1.5">
                {publishBlockers.map((b) => (
                  <li key={b.code + b.label} className="flex flex-col gap-0.5">
                    <span className="flex gap-2">
                      <span className="font-bold">✕</span>
                      <span>{b.label}</span>
                    </span>
                    {b.recommendedAction ? (
                      <span className="ml-5 text-[11px] opacity-90">{b.recommendedAction}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {warnings.length > 0 ? (
            <div className={adminAlertSurface("warning")}>
              <p className="text-[11px] font-bold uppercase tracking-wide">Warnings</p>
              <ul className="mt-1.5 space-y-1.5">
                {warnings.map((b) => (
                  <li key={b.code + b.label} className="flex flex-col gap-0.5">
                    <span className="flex gap-2">
                      <span>!</span>
                      <span>{b.label}</span>
                    </span>
                    {b.recommendedAction ? (
                      <span className="ml-5 text-[11px] opacity-90">{b.recommendedAction}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </PremiumSectionCard>
  );
}
