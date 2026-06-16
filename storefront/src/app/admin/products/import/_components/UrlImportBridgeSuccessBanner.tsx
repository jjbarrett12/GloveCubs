"use client";

import Link from "next/link";
import { buildUrlImportBridgeSuccessLinks } from "@/lib/admin/clipboard-staging-catalogos-bridge";

export function UrlImportBridgeSuccessBanner({
  batchId,
  normalizedCount,
  catalogosBaseUrl = "",
  jobId,
  className = "rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950",
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
    <div className={className}>
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
              className="font-semibold text-[#c2410c] underline hover:text-[#e5582d]"
            >
              {links.primaryLabel}
            </a>
          ) : (
            <Link
              href={links.primaryHref}
              className="font-semibold text-[#c2410c] underline hover:text-[#e5582d]"
            >
              {links.primaryLabel}
            </Link>
          )}
        </>
      ) : null}
      {links.secondaryHref && links.secondaryLabel ? (
        <>
          {" "}
          <span className="text-slate-600">·</span>{" "}
          <Link
            href={links.secondaryHref}
            className="text-xs font-semibold text-slate-700 underline hover:text-[#c2410c]"
          >
            {links.secondaryLabel}
          </Link>
        </>
      ) : null}
      {links.jobHref ? (
        <>
          {" "}
          <span className="text-slate-600">·</span>{" "}
          <a
            href={links.jobHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-slate-700 underline hover:text-[#c2410c]"
          >
            View URL import job
          </a>
        </>
      ) : null}
    </div>
  );
}
