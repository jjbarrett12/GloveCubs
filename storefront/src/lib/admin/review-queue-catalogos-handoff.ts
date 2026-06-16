/**
 * Storefront review queue handoff for CatalogOS URL-import batches/rows.
 * Visibility surface — canonical review/publish stays in CatalogOS.
 */

import type { IngestionLineage } from "@/lib/unified-ingestion/types";
import { catalogosUrlImportJobDetailPath } from "@/lib/admin/clipboard-promote-guards";

export function parseIngestionJobLineage(raw: unknown): IngestionLineage {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const out: IngestionLineage = {};
  if (typeof o.url_import_job_id === "string" && o.url_import_job_id.trim()) {
    out.url_import_job_id = o.url_import_job_id.trim();
  }
  if (typeof o.url_import_product_id === "string" && o.url_import_product_id.trim()) {
    out.url_import_product_id = o.url_import_product_id.trim();
  }
  if (typeof o.import_batch_id === "string" && o.import_batch_id.trim()) {
    out.import_batch_id = o.import_batch_id.trim();
  }
  return out;
}

export function isCatalogosUrlImportUnifiedRow(row: {
  catalogosUrlImportJobId: string | null;
}): boolean {
  return Boolean(row.catalogosUrlImportJobId);
}

/** batchId query param from bridge lands on storefront review — batch lives in CatalogOS. */
export function isCatalogosImportBatchHandoff(batchId: string): boolean {
  return batchId.trim().length > 0;
}

export function catalogosReviewBatchUrl(catalogosBaseUrl: string, batchId: string): string {
  const base = catalogosBaseUrl.trim().replace(/\/+$/, "");
  const id = batchId.trim();
  if (!base || !id) return "";
  return `${base}/dashboard/review?batch_id=${encodeURIComponent(id)}`;
}

export function catalogosReviewDashboardUrl(catalogosBaseUrl: string): string {
  const base = catalogosBaseUrl.trim().replace(/\/+$/, "");
  if (!base) return "";
  return `${base}/dashboard/review`;
}

export function catalogosUrlImportJobPageUrl(catalogosBaseUrl: string, jobId: string): string {
  const base = catalogosBaseUrl.trim().replace(/\/+$/, "");
  const id = jobId.trim();
  if (!base || !id) return "";
  return `${base}${catalogosUrlImportJobDetailPath(id)}`;
}
