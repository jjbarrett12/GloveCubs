"use client";

import Link from "next/link";
import { PremiumSectionCard } from "@/components/admin/PremiumSectionCard";
import { adminAlertSurface, adminLink, adminPrimaryButton, adminSecondaryButton } from "@/components/admin/admin-theme-utils";
import type { CatalogosEditorHandoff } from "@/lib/admin/canonical-publish-policy";
import { cn } from "@/lib/utils";
import { hasDraftSaveBlockers, type EditorReadinessResult } from "@/lib/admin/product-editor-readiness";

type Props = {
  readiness: EditorReadinessResult;
  draftReadiness?: EditorReadinessResult;
  urlImportReview?: boolean;
  storefrontPublishBlocked?: boolean;
  catalogosHandoff?: CatalogosEditorHandoff | null;
};

export function PublishReadinessPanel({
  readiness,
  draftReadiness,
  urlImportReview = false,
  storefrontPublishBlocked = false,
  catalogosHandoff = null,
}: Props) {
  const { warnings, publishBlockers } = readiness;
  const saveReadiness = draftReadiness ?? readiness;
  const draftSaveBlocked = hasDraftSaveBlockers(saveReadiness);
  const showDraftSaveHint =
    (urlImportReview || storefrontPublishBlocked) && publishBlockers.length > 0 && !draftSaveBlocked;
  const catalogosPrimaryUrl =
    catalogosHandoff?.urlImportJobUrl ?? catalogosHandoff?.reviewUrl ?? catalogosHandoff?.publishUrl ?? null;

  return (
    <PremiumSectionCard title="Publish readiness" dense>
      {catalogosHandoff && catalogosPrimaryUrl ? (
        <div className={cn(adminAlertSurface("info", "mb-3 border-0 px-3 py-2 text-xs"))}>
          <p className="font-medium">Go live in CatalogOS</p>
          <p className="mt-1 text-admin-secondary">
            Save as <strong>Draft</strong> here first, then open CatalogOS to publish.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {catalogosHandoff.urlImportJobUrl ? (
              <Link
                href={catalogosHandoff.urlImportJobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(adminPrimaryButton, "inline-flex text-[11px]")}
              >
                URL import preview
              </Link>
            ) : null}
            <Link
              href={catalogosHandoff.reviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(adminSecondaryButton, "inline-flex text-[11px]")}
            >
              Review queue
            </Link>
            <Link
              href={catalogosHandoff.publishUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(adminSecondaryButton, "inline-flex text-[11px]")}
            >
              Publish-ready
            </Link>
          </div>
        </div>
      ) : null}
      {showDraftSaveHint ? (
        <div className={cn(adminAlertSurface("success", "mb-3 border-0 px-3 py-2 text-xs"))}>
          Publish blockers apply to go-live only. Choose <strong>Draft</strong> and click <strong>Save</strong> to keep
          your edits.
        </div>
      ) : null}
      {draftSaveBlocked ? (
        <div className={cn(adminAlertSurface("critical", "mb-3"))}>
          <p className="text-[11px] font-bold uppercase tracking-wide">Save blockers</p>
          <ul className="mt-1.5 space-y-1.5 text-sm">
            {saveReadiness.draftSaveBlockers.map((b) => (
              <li key={b.code + b.label} className="flex gap-2">
                <span className="font-bold">✕</span>
                <span>{b.label}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
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
