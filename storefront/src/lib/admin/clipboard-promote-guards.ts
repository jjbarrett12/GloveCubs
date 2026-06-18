/**
 * Clipboard URL staging promote guards — draft-only, no storefront publish bypass.
 */

import {
  CLIPBOARD_EXTRACTION_AUTHORITY_CATALOGOS,
  CLIPBOARD_EXTRACTION_AUTHORITY_LOCAL,
} from "@/lib/admin/clipboard-url-catalogos-extract";

export const URL_IMPORT_REVIEW_REQUIRED_MESSAGE =
  "Imported products must be reviewed before publishing.";

export const URL_IMPORT_REVIEW_GUIDANCE =
  "Complete required fields, confirm variants, then publish to catalog.";

/** Staging promote route — cannot skip review by setting active in promote body. */
export const CLIPBOARD_PROMOTE_PUBLISH_BLOCKED_MESSAGE = `${URL_IMPORT_REVIEW_REQUIRED_MESSAGE} ${URL_IMPORT_REVIEW_GUIDANCE}`;

/** Non-admin paths must not activate URL-import drafts without admin review. */
export const URL_IMPORT_NON_ADMIN_PUBLISH_BLOCKED_MESSAGE =
  "URL-import products cannot be published without admin review.";

const URL_IMPORT_EXTRACTION_AUTHORITIES = new Set([
  CLIPBOARD_EXTRACTION_AUTHORITY_CATALOGOS,
  CLIPBOARD_EXTRACTION_AUTHORITY_LOCAL,
  "catalogos_url_import_v2",
  "storefront_product_extraction_v2",
]);

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Product was created from clipboard URL staging (import_staging_id in metadata). */
export function isClipboardUrlImportProductMetadata(
  meta: Record<string, unknown> | null | undefined
): boolean {
  if (!meta) return false;
  const stagingId = meta.import_staging_id;
  return typeof stagingId === "string" && stagingId.trim().length > 0;
}

/** Any URL-import provenance marker — blocks storefront active publish. */
export function isUrlImportProductMetadata(
  meta: Record<string, unknown> | null | undefined
): boolean {
  if (!meta) return false;
  if (isClipboardUrlImportProductMetadata(meta)) return true;
  const jobId = meta.catalogos_url_import_job_id;
  if (typeof jobId === "string" && jobId.trim()) return true;
  const productId = meta.catalogos_url_import_product_id;
  if (typeof productId === "string" && productId.trim()) return true;
  const auth = meta.import_extraction_authority;
  if (typeof auth === "string" && isKnownUrlImportExtractionAuthority(auth)) return true;
  return false;
}

/** CatalogOS V2 extraction path (vs local fallback). */
export function isCatalogosUrlImportProductMetadata(
  meta: Record<string, unknown> | null | undefined
): boolean {
  if (!meta) return false;
  const auth = meta.import_extraction_authority;
  return typeof auth === "string" && auth.trim() === CLIPBOARD_EXTRACTION_AUTHORITY_CATALOGOS;
}

/** Reject promote request bodies that attempt to set publish/active status. */
export function clipboardPromoteStatusOverrideError(body: Record<string, unknown>): string | null {
  const raw = body.status;
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase();
  if (s === "active" || s === "published" || s === "publish") {
    return CLIPBOARD_PROMOTE_PUBLISH_BLOCKED_MESSAGE;
  }
  return null;
}

/** Metadata seed from staging extracted blob for catalog product.metadata. */
export function clipboardImportMetadataFromStagingExtracted(
  extracted: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  const authority = extracted.extraction_authority;
  if (typeof authority === "string" && authority.trim()) {
    const trimmed = authority.trim();
    out.import_extraction_authority = trimmed;
  }

  const jobId = extracted.catalogos_job_id;
  if (typeof jobId === "string" && jobId.trim()) {
    out.catalogos_url_import_job_id = jobId.trim();
  }

  const productId = extracted.catalogos_product_id;
  if (typeof productId === "string" && productId.trim()) {
    out.catalogos_url_import_product_id = productId.trim();
  }

  const summary = asObject(extracted.product_setup_contract_summary);
  if (summary) {
    const schemaVersion = summary.schemaVersion;
    if (typeof schemaVersion === "string" && schemaVersion.trim()) {
      out.product_setup_contract_schema_version = schemaVersion.trim();
    }
    out.import_has_product_setup_contract_summary = true;
  }

  const sourceUrl =
    typeof extracted.source_product_page_url === "string"
      ? extracted.source_product_page_url.trim()
      : "";
  if (sourceUrl) {
    out.import_source_url = sourceUrl;
  }

  return out;
}

/**
 * Block non-admin activation of URL-import drafts.
 * Admin product editor review publish passes `adminReviewPublish: true`.
 */
export function clipboardUrlImportActiveStatusError(
  meta: Record<string, unknown> | null | undefined,
  targetStatus: "draft" | "active",
  options?: { adminReviewPublish?: boolean }
): string | null {
  if (targetStatus !== "active") return null;
  if (!isUrlImportProductMetadata(meta)) return null;
  if (options?.adminReviewPublish) return null;
  return URL_IMPORT_NON_ADMIN_PUBLISH_BLOCKED_MESSAGE;
}

export function catalogosUrlImportJobDetailPath(jobId: string): string {
  return `/dashboard/url-import/${encodeURIComponent(jobId.trim())}`;
}

/** Whether extraction authority string is a known URL-import clipboard path. */
export function isKnownUrlImportExtractionAuthority(value: string): boolean {
  return URL_IMPORT_EXTRACTION_AUTHORITIES.has(value.trim());
}
