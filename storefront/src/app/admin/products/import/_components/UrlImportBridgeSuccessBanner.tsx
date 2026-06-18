"use client";

import Link from "next/link";
import { buildUrlImportBridgeSuccessLinks } from "@/lib/admin/clipboard-staging-catalogos-bridge";
import { adminAlertSurface, adminLink } from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";

export function UrlImportBridgeSuccessBanner({
  batchId,
  normalizedCount,
  catalogosBaseUrl = "",
  jobId,
  className,
}: {
  batchId: string | null;
  normalizedCount?: number | null;
  catalogosBaseUrl?: string;
  jobId?: string | null;
  className?: string;
}) {
  const links = buildUrlImportBridgeSuccessLinks({
    catalogosBaseUrl,
    batchId,
    jobId: jobId ?? null,
  });

  if (!batchId && !links.primaryHref) return null;

  return (
    <div className={cn(adminAlertSurface("success"), className)}>
      Bridged to CatalogOS import batch.
      {batchId ? (
        <>
          {" "}
          Batch <span className="font-mono">{batchId}</span>
        </>
      ) : null}
      {normalizedCount != null ? (
        <>
          {" "}
          · {normalizedCount} normalized
        </>
      ) : null}
      . Review and publish in CatalogOS.
      {links.primaryHref ? (
        <>
          {" "}
          {links.primaryExternal ? (
            <a
              href={links.primaryHref}
              target="_blank"
              rel="noopener noreferrer"
              className={cn("font-semibold underline", adminLink)}
            >
              {links.primaryLabel}
            </a>
          ) : (
            <Link href={links.primaryHref} className={cn("font-semibold underline", adminLink)}>
              {links.primaryLabel}
            </Link>
          )}
        </>
      ) : null}
      {links.secondaryHref && links.secondaryLabel ? (
        <>
          {" "}
          <span className="text-admin-muted">·</span>{" "}
          <Link href={links.secondaryHref} className={cn("text-xs font-semibold underline", adminLink)}>
            {links.secondaryLabel}
          </Link>
        </>
      ) : null}
      {links.jobHref ? (
        <>
          {" "}
          <span className="text-admin-muted">·</span>{" "}
          <a
            href={links.jobHref}
            target="_blank"
            rel="noopener noreferrer"
            className={cn("text-xs font-semibold underline", adminLink)}
          >
            View URL import job
          </a>
        </>
      ) : null}
    </div>
  );
}
