"use client";

import Link from "next/link";
import { StatusBadge } from "@/components/admin/StatusBadge";
import {
  adminCardSurface,
  adminFormInput,
  adminLink,
  adminPrimaryButton,
  adminSecondaryButton,
  adminStatusBadgeClasses,
} from "@/components/admin/admin-theme-utils";
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
  status: "draft" | "active";
  quoteOnly: boolean;
  parserVersion: string | null;
  readiness: EditorReadinessResult;
  storefrontPath: string | null;
  pending: boolean;
  pendingAction?: "draft" | "publish" | null;
  dirty: boolean;
  onSaveDraft: () => void;
  onPublish: () => void;
  urlImportReview?: boolean;
  storefrontPublishBlocked?: boolean;
  catalogosPublishUrl?: string | null;
};

export function ProductCommandHeader({
  name,
  primaryImageUrl,
  imageRequired,
  status,
  quoteOnly,
  parserVersion,
  readiness,
  storefrontPath,
  pending,
  pendingAction,
  dirty,
  onSaveDraft,
  onPublish,
  urlImportReview,
  storefrontPublishBlocked = false,
  catalogosPublishUrl = null,
}: Props) {
  const publishBlocked = hasPublishBlockers(readiness) || storefrontPublishBlocked;
  const draftSaveBlocked = hasDraftSaveBlockers(readiness);
  const readinessText = readinessLabel(readiness);
  const readinessTooltip = readinessDetail(readiness);

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
              <StatusBadge status={status} />
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
          <button
            type="button"
            disabled={pending || draftSaveBlocked}
            onClick={onSaveDraft}
            title={draftSaveBlocked ? readiness.draftSaveBlockers.map((b) => b.label).join("; ") : undefined}
            className={adminSecondaryButton}
          >
            {pending && pendingAction === "draft" ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            disabled={pending || publishBlocked}
            onClick={onPublish}
            title={
              storefrontPublishBlocked
                ? "Use CatalogOS publish for production go-live."
                : publishBlocked
                  ? readinessTooltip
                  : undefined
            }
            className={adminPrimaryButton}
          >
            {pending && pendingAction === "publish"
              ? "Publishing…"
              : urlImportReview
                ? "Approve & publish to catalog"
                : "Publish"}
          </button>
          {storefrontPublishBlocked && catalogosPublishUrl ? (
            <Link
              href={catalogosPublishUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(adminSecondaryButton, "text-xs")}
            >
              Publish in CatalogOS
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
