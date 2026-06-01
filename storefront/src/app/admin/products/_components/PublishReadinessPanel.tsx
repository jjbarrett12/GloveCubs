"use client";

import { PremiumSectionCard } from "@/components/admin/PremiumSectionCard";
import type { EditorReadinessResult } from "@/lib/admin/product-editor-readiness";

type Props = {
  readiness: EditorReadinessResult;
};

export function PublishReadinessPanel({ readiness }: Props) {
  const { warnings, publishBlockers } = readiness;

  return (
    <PremiumSectionCard title="Publish readiness" dense>
      {publishBlockers.length === 0 && warnings.length === 0 ? (
        <p className="text-sm font-medium text-emerald-700">All checks passed — ready when you publish.</p>
      ) : (
        <div className="space-y-3 text-sm">
          {publishBlockers.length > 0 ? (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-red-700">Publish blockers</p>
              <ul className="mt-1.5 space-y-1.5">
                {publishBlockers.map((b) => (
                  <li key={b.code + b.label} className="flex gap-2 text-red-800">
                    <span className="font-bold">✕</span>
                    <span>{b.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {warnings.length > 0 ? (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700">Warnings</p>
              <ul className="mt-1.5 space-y-1.5">
                {warnings.map((b) => (
                  <li key={b.code + b.label} className="flex gap-2 text-amber-800">
                    <span>!</span>
                    <span>{b.label}</span>
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
