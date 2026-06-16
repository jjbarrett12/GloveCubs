/**
 * Bridge clipboard CatalogOS URL staging rows into CatalogOS review pipeline.
 * Uses existing storefront → CatalogOS import proxy (no new ingest path).
 */

import {
  CLIPBOARD_EXTRACTION_AUTHORITY_CATALOGOS,
} from "@/lib/admin/clipboard-url-catalogos-extract";
import { catalogosUrlImportJobDetailPath } from "@/lib/admin/clipboard-promote-guards";
import { catalogosReviewBatchUrl } from "@/lib/admin/review-queue-catalogos-handoff";

export type UrlImportBridgeSuccessLinks = {
  primaryHref: string;
  primaryLabel: string;
  primaryExternal: boolean;
  secondaryHref: string | null;
  secondaryLabel: string | null;
  jobHref: string | null;
};

/** Prefer CatalogOS review/batch when base URL is configured; storefront review is fallback. */
export function buildUrlImportBridgeSuccessLinks(input: {
  catalogosBaseUrl: string;
  batchId: string | null;
  jobId?: string | null;
}): UrlImportBridgeSuccessLinks {
  const batchId = input.batchId?.trim() ?? "";
  const storefrontReview = batchId ? storefrontReviewQueuePath(batchId) : "";
  const batchReviewUrl =
    batchId && input.catalogosBaseUrl
      ? catalogosReviewBatchUrl(input.catalogosBaseUrl, batchId)
      : "";
  const dashboardUrl = catalogosReviewDashboardUrl(input.catalogosBaseUrl);
  const jobUrl =
    input.jobId && input.catalogosBaseUrl
      ? catalogosUrlImportJobPageUrl(input.catalogosBaseUrl, input.jobId)
      : "";

  if (batchReviewUrl) {
    return {
      primaryHref: batchReviewUrl,
      primaryLabel: "Open batch in CatalogOS review",
      primaryExternal: true,
      secondaryHref: storefrontReview || null,
      secondaryLabel: storefrontReview ? "Storefront review (visibility)" : null,
      jobHref: jobUrl || null,
    };
  }

  if (dashboardUrl) {
    return {
      primaryHref: dashboardUrl,
      primaryLabel: "Open CatalogOS review",
      primaryExternal: true,
      secondaryHref: storefrontReview || null,
      secondaryLabel: storefrontReview ? "Storefront review queue" : null,
      jobHref: jobUrl || null,
    };
  }

  return {
    primaryHref: storefrontReview,
    primaryLabel: "Open storefront review queue",
    primaryExternal: false,
    secondaryHref: null,
    secondaryLabel: null,
    jobHref: null,
  };
}

export type ClipboardCatalogosStagingRef = {
  jobId: string;
  productId: string;
  extractionAuthority: string;
};

/** Parse CatalogOS job + product ids from clipboard staging extracted blob. */
export function parseClipboardCatalogosStagingRef(
  extracted: Record<string, unknown>
): ClipboardCatalogosStagingRef | null {
  const jobId = extracted.catalogos_job_id;
  const productId = extracted.catalogos_product_id;
  if (typeof jobId !== "string" || !jobId.trim()) return null;
  if (typeof productId !== "string" || !productId.trim()) return null;

  const authority =
    typeof extracted.extraction_authority === "string"
      ? extracted.extraction_authority.trim()
      : "";
  if (authority !== CLIPBOARD_EXTRACTION_AUTHORITY_CATALOGOS) return null;

  return {
    jobId: jobId.trim(),
    productId: productId.trim(),
    extractionAuthority: authority,
  };
}

/** Storefront admin proxy → CatalogOS POST /api/admin/url-import/[jobId]/bridge */
export function storefrontUrlImportBridgeApiPath(jobId: string): string {
  return `/admin/api/products/import/url/jobs/${encodeURIComponent(jobId.trim())}/bridge`;
}

export function storefrontReviewQueuePath(batchId: string): string {
  return `/admin/products/review?batchId=${encodeURIComponent(batchId.trim())}`;
}

export function catalogosUrlImportJobPageUrl(catalogosBaseUrl: string, jobId: string): string {
  const base = catalogosBaseUrl.trim().replace(/\/+$/, "");
  if (!base) return "";
  return `${base}${catalogosUrlImportJobDetailPath(jobId)}`;
}

export function catalogosReviewDashboardUrl(catalogosBaseUrl: string): string {
  const base = catalogosBaseUrl.trim().replace(/\/+$/, "");
  if (!base) return "";
  return `${base}/dashboard/review`;
}
