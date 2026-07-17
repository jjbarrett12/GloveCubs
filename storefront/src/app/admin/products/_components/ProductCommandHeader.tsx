"use client";

import Link from "next/link";
import { StatusBadge } from "@/components/admin/StatusBadge";
import {
  adminCardSurface,
  adminLink,
  adminPrimaryButton,
  adminSecondaryButton,
  adminStatusBadgeClasses,
} from "@/components/admin/admin-theme-utils";
import type { CatalogosEditorHandoff } from "@/lib/admin/canonical-publish-policy";
import { cn } from "@/lib/utils";
import {
  hasDraftSaveBlockers,
  hasPublishBlockers,
  readinessDetail,
  readinessLabel,
  type EditorReadinessResult,
} from "@/lib/admin/product-editor-readiness";

type Props = {
  name: string;
  primaryImageUrl?: string;
  imageRequired?: boolean;
  targetStatus: "draft" | "active";
  onTargetStatusChange: (status: "draft" | "active") => void;
  quoteOnly: boolean;
  parserVersion: string | null;
  readiness: EditorReadinessResult;
  draftReadiness?: EditorReadinessResult;
  storefrontPath: string | null;
  pending: boolean;
  pendingAction?: "draft" | "publish" | null;
  dirty: boolean;
  onSave: () => void;
  urlImportReview?: boolean;
  storefrontPublishBlocked?: boolean;
  catalogosHandoff?: CatalogosEditorHandoff | null;
};

export function ProductCommandHeader({
  name,
  primaryImageUrl,
  imageRequired,
  targetStatus,
  onTargetStatusChange,
  quoteOnly,
  parserVersion,
  readiness,
  draftReadiness,
  storefrontPath,
  pending,
  pendingAction,
  dirty,
  onSave,
  urlImportReview,
  storefrontPublishBlocked = false,
  catalogosHandoff = null,
}: Props) {
  const saveReadiness = draftReadiness ?? readiness;
  const publishBlocked = hasPublishBlockers(readiness) || storefrontPublishBlocked;
  const draftSaveBlocked = hasDraftSaveBlockers(saveReadiness);
  const publishIntentBlocked =
    targetStatus === "active" && (publishBlocked || (urlImportReview && storefrontPublishBlocked));
  const saveBlocked = draftSaveBlocked || publishIntentBlocked;
  const readinessText = readinessLabel(readiness);
  const readinessTooltip = readinessDetail(readiness);
  const catalogosPrimaryUrl =
    catalogosHandoff?.urlImportJobUrl ?? catalogosHandoff?.reviewUrl ?? catalogosHandoff?.publishUrl ?? null;

  return (
    <header
      className={cn(
        adminCardSurface,
        "sticky top-0 z-20 -mx-5 border-b border-admin-border bg-admin-surface/95 px-5 py-3 backdrop-blur supports-[backdrop-filter]:bg-admin-surface/90 sm:-mx-8 sm:px-8",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div
            className={cn(
              "relative shrink-0 overflow-hidden rounded-lg border bg-admin-surface-muted",
              imageRequired ? "border-2 border-admin-danger ring-2 ring-admin-danger/20" : "border-admin-border",
            )}
            title={imageRequired ? "Primary image required to publish" : undefined}
          >
            {primaryImageUrl?.trim() ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={primaryImageUrl.trim()}
                alt=""
                className="h-28 w-28 object-contain sm:h-32 sm:w-32"
              />
            ) : (
              <div className="flex h-28 w-28 flex-col items-center justify-center px-1 text-center sm:h-32 sm:w-32">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-admin-muted">No image</span>
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="line-clamp-2 text-lg font-semibold tracking-tight text-admin-primary sm:line-clamp-none sm:truncate">
              {name || "Untitled product"}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <StatusBadge status={targetStatus} />
              {quoteOnly ? (
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", adminStatusBadgeClasses("warning"))}>
                  Quote only
                </span>
              ) : null}
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", adminStatusBadgeClasses("neutral"))}>
                {parserVersion ?? "Manual"}
              </span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  adminStatusBadgeClasses(publishBlocked ? "danger" : "success"),
                )}
                title={readinessTooltip}
              >
                {readinessText}
              </span>
              {dirty ? <span className="text-[11px] font-medium text-admin-accent">Unsaved changes</span> : null}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {storefrontPath ? (
            <Link href={storefrontPath} target="_blank" rel="noopener noreferrer" className={cn(adminSecondaryButton, "text-xs")}>
              View storefront
            </Link>
          ) : null}
          <div
            role="group"
            aria-label="Catalog status"
            className="inline-flex overflow-hidden rounded-lg border border-admin-border bg-admin-surface-muted p-0.5"
          >
            {(["draft", "active"] as const).map((value) => (
              <button
                key={value}
                type="button"
                disabled={pending}
                onClick={() => onTargetStatusChange(value)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition-colors",
                  targetStatus === value
                    ? value === "active"
                      ? "bg-admin-accent text-white shadow-sm"
                      : "bg-admin-surface text-admin-primary shadow-sm"
                    : "text-admin-muted hover:text-admin-primary",
                )}
              >
                {value === "active" ? "Published" : "Draft"}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={pending || saveBlocked}
            onClick={onSave}
            title={
              saveBlocked
                ? publishIntentBlocked
                  ? readinessTooltip
                  : saveReadiness.draftSaveBlockers.map((b) => b.label).join("; ")
                : targetStatus === "active"
                  ? "Save and publish to storefront catalog"
                  : "Save as draft"
            }
            className={adminPrimaryButton}
          >
            {pending ? "Saving…" : targetStatus === "active" ? "Save & publish" : "Save"}
          </button>
          {catalogosHandoff && catalogosPrimaryUrl ? (
            <Link
              href={catalogosPrimaryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(adminSecondaryButton, "text-xs font-semibold")}
            >
              Open CatalogOS
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
