/**
 * Launch catalog publish policy — CatalogOS runPublish is the normal production path.
 */

import {
  catalogosUrlImportJobDetailPath,
  isUrlImportProductMetadata,
} from "@/lib/admin/clipboard-promote-guards";

/** Default CatalogOS dev server — see catalogos-internal-client.ts */
export const CATALOGOS_LOCAL_DEV_BASE_URL = "http://localhost:3010";

export const CATALOGOS_CANONICAL_PUBLISH_MESSAGE =
  "Production publish must use CatalogOS publish to preserve variants, offers, images, attributes, and pricing.";

export const URL_IMPORT_CATALOGOS_PUBLISH_REQUIRED_MESSAGE =
  "URL-import products must be reviewed and published in CatalogOS (runPublish). Storefront active publish is not available for import provenance.";

/** Emergency/dev-only: allow storefront status=active flip (still not runPublish). */
export function isEmergencyStorefrontActivePublishEnabled(): boolean {
  const v = process.env.GLOVECUBS_EMERGENCY_STOREFRONT_ACTIVE_PUBLISH?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** True when operator may set status=active from the storefront product editor. */
export function isStorefrontManualActivePublishAllowed(): boolean {
  if (isEmergencyStorefrontActivePublishEnabled()) return true;
  return process.env.NODE_ENV !== "production";
}

/** URL-import provenance still requires CatalogOS on true production unless manual publish is allowed. */
export function isUrlImportStorefrontPublishBlocked(
  metadata: Record<string, unknown> | null | undefined
): boolean {
  if (!isUrlImportProductMetadata(metadata)) return false;
  return !isStorefrontManualActivePublishAllowed();
}

export function evaluateStorefrontManualActivePublishGuard(
  targetStatus: "draft" | "active",
): string | null {
  if (targetStatus !== "active") return null;
  if (isStorefrontManualActivePublishAllowed()) return null;
  return CATALOGOS_CANONICAL_PUBLISH_MESSAGE;
}

export function catalogosReviewDashboardUrl(catalogosBaseUrl: string): string {
  const base = catalogosBaseUrl.trim().replace(/\/+$/, "");
  if (!base) return "";
  return `${base}/dashboard/review`;
}

export function catalogosPublishDashboardUrl(catalogosBaseUrl: string): string {
  const base = catalogosBaseUrl.trim().replace(/\/+$/, "");
  if (!base) return "";
  return `${base}/dashboard/publish`;
}

export function catalogosReviewStagingUrl(catalogosBaseUrl: string, stagingId: string): string {
  const base = catalogosBaseUrl.trim().replace(/\/+$/, "");
  const id = stagingId.trim();
  if (!base || !id) return "";
  return `${base}/dashboard/review/${encodeURIComponent(id)}`;
}

export function resolveCatalogosPublicBaseUrl(): string {
  const explicit =
    process.env.NEXT_PUBLIC_CATALOGOS_URL?.trim().replace(/\/+$/, "") ||
    process.env.CATALOGOS_INTERNAL_URL?.trim().replace(/\/+$/, "") ||
    "";
  if (explicit) return explicit;
  if (process.env.NODE_ENV !== "production") return CATALOGOS_LOCAL_DEV_BASE_URL;
  return "";
}

export type CatalogosEditorHandoff = {
  baseUrl: string;
  publishUrl: string;
  reviewUrl: string;
  urlImportUrl: string;
  urlImportJobUrl: string | null;
};

/** Operator deep-links from storefront product editor → CatalogOS review/publish/url-import. */
export function resolveCatalogosEditorHandoff(
  metadata: Record<string, unknown> | null | undefined
): CatalogosEditorHandoff | null {
  const baseUrl = resolveCatalogosPublicBaseUrl();
  if (!baseUrl) return null;
  const jobId =
    typeof metadata?.catalogos_url_import_job_id === "string"
      ? metadata.catalogos_url_import_job_id.trim()
      : "";
  return {
    baseUrl,
    publishUrl: catalogosPublishDashboardUrl(baseUrl),
    reviewUrl: catalogosReviewDashboardUrl(baseUrl),
    urlImportUrl: `${baseUrl}/dashboard/url-import`,
    urlImportJobUrl: jobId ? `${baseUrl}${catalogosUrlImportJobDetailPath(jobId)}` : null,
  };
}
