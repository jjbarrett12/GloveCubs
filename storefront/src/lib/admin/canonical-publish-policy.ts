/**
 * Launch catalog publish policy — CatalogOS runPublish is the normal production path.
 */

export const CATALOGOS_CANONICAL_PUBLISH_MESSAGE =
  "Production publish must use CatalogOS publish to preserve variants, offers, images, attributes, and pricing.";

export const URL_IMPORT_CATALOGOS_PUBLISH_REQUIRED_MESSAGE =
  "URL-import products must be reviewed and published in CatalogOS (runPublish). Storefront active publish is not available for import provenance.";

/** Emergency/dev-only: allow storefront status=active flip (still not runPublish). */
export function isEmergencyStorefrontActivePublishEnabled(): boolean {
  const v = process.env.GLOVECUBS_EMERGENCY_STOREFRONT_ACTIVE_PUBLISH?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function isStorefrontManualActivePublishAllowed(): boolean {
  return isEmergencyStorefrontActivePublishEnabled();
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
  return (
    process.env.NEXT_PUBLIC_CATALOGOS_URL?.trim().replace(/\/+$/, "") ||
    process.env.CATALOGOS_INTERNAL_URL?.trim().replace(/\/+$/, "") ||
    ""
  );
}
