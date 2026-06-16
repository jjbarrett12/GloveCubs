/**
 * Unified ingestion review queue read model (catalog_v2 staging).
 */

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import type { IngestionJobStatus, IngestionMode } from "@/lib/unified-ingestion/types";
import { parseIngestionJobLineage } from "@/lib/admin/review-queue-catalogos-handoff";

export type FieldEvidenceSummary = {
  value: unknown;
  confidence: number;
  sourceType: string;
  sourceRef: string | null;
  extractionMethod: string;
};

export type UnifiedReviewQueueRow = {
  rowKind: "unified";
  stagingVariantId: string;
  stagingProductId: string;
  jobId: string;
  ingestionMode: IngestionMode;
  jobStatus: IngestionJobStatus;
  reviewStatus: string;
  sourceUrl: string;
  sourceFingerprint: string;
  productFingerprint: string;
  blockedReason: string | null;
  duplicateOf: string | null;
  mediaStatus: string;
  title: string;
  primaryImageUrl: string | null;
  promotedCatalogProductId: string | null;
  promotedCatalogVariantId: string | null;
  catalogosUrlImportJobId: string | null;
  catalogosUrlImportProductId: string | null;
  sourceBatchId: string | null;
  createdAt: string;
  evidenceByField: Record<string, FieldEvidenceSummary>;
};

export type ReviewQueueFilters = {
  mode?: IngestionMode | "all";
  jobStatus?: IngestionJobStatus | "all";
  limit?: number;
};

type EvidenceRow = {
  staging_variant_id: string;
  field_key: string;
  extracted_value: unknown;
  confidence: number;
  source_type: string;
  source_ref: string | null;
  extraction_method: string;
  created_at: string;
};

export function aggregateEvidenceByField(rows: EvidenceRow[]): Map<string, FieldEvidenceSummary> {
  const byField = new Map<string, EvidenceRow>();
  for (const row of rows) {
    const prev = byField.get(row.field_key);
    if (!prev || row.created_at > prev.created_at) {
      byField.set(row.field_key, row);
    }
  }
  const out = new Map<string, FieldEvidenceSummary>();
  Array.from(byField.entries()).forEach(([key, row]) => {
    out.set(key, {
      value: row.extracted_value,
      confidence: Number(row.confidence) || 0,
      sourceType: row.source_type,
      sourceRef: row.source_ref,
      extractionMethod: row.extraction_method,
    });
  });
  return out;
}

/** Collapse duplicate product_fingerprint rows — keep newest created_at. */
export function dedupeUnifiedQueueRows(rows: UnifiedReviewQueueRow[]): UnifiedReviewQueueRow[] {
  const byFp = new Map<string, UnifiedReviewQueueRow>();
  for (const row of rows) {
    const fp = row.productFingerprint || row.stagingVariantId;
    const prev = byFp.get(fp);
    if (!prev || row.createdAt > prev.createdAt) {
      byFp.set(fp, row);
    }
  }
  return Array.from(byFp.values()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function modeLabel(mode: IngestionMode): string {
  return mode === "quick_draft" ? "Quick Draft" : "Deep Supplier Crawl";
}

export async function listUnifiedReviewQueue(
  filters: ReviewQueueFilters = {}
): Promise<UnifiedReviewQueueRow[]> {
  if (!isSupabaseConfigured()) return [];

  const limit = Math.min(Math.max(filters.limit ?? 200, 1), 500);
  const supabase = getSupabaseAdmin() as any;

  let variantQuery = supabase
    .schema("catalog_v2")
    .from("catalog_staging_variants")
    .select(
      `
      id,
      staging_product_id,
      ingestion_job_id,
      source_url,
      product_fingerprint,
      media_status,
      primary_image_url,
      proposed_variant_sku,
      status,
      promoted_catalog_variant_id,
      created_at,
      catalog_staging_products!inner (
        id,
        ingestion_job_id,
        ingestion_mode,
        source_url,
        source_fingerprint,
        product_fingerprint,
        review_status,
        normalized_name,
        normalized_brand,
        promoted_catalog_product_id,
        media_status,
        source_batch_id,
        created_at,
        ingestion_jobs!inner (
          id,
          status,
          blocked_reason,
          metadata,
          lineage,
          source_fingerprint,
          ingestion_mode,
          created_at
        )
      )
    `
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  const { data: variants, error: vErr } = await variantQuery;
  if (vErr) {
    console.error("[unified-review-queue] variants", vErr.message);
    return [];
  }

  const variantIds: string[] = [];
  const rows: UnifiedReviewQueueRow[] = [];

  for (const raw of variants ?? []) {
    const v = raw as Record<string, unknown>;
    const product = v.catalog_staging_products as Record<string, unknown>;
    const job = product?.ingestion_jobs as Record<string, unknown>;
    if (!product || !job) continue;

    const reviewStatus = String(product.review_status ?? "");
    if (reviewStatus !== "needs_review") {
      continue;
    }

    const jobStatus = String(job.status ?? "") as IngestionJobStatus;
    const ingestionMode = String(job.ingestion_mode ?? product.ingestion_mode ?? "") as IngestionMode;

    if (filters.mode && filters.mode !== "all" && ingestionMode !== filters.mode) continue;
    if (filters.jobStatus && filters.jobStatus !== "all" && jobStatus !== filters.jobStatus) continue;

    const metadata = (job.metadata ?? {}) as Record<string, unknown>;
    const lineage = parseIngestionJobLineage(job.lineage);
    const duplicateOf =
      typeof metadata.duplicate_of === "string" ? metadata.duplicate_of : null;

    const evidenceByField: Record<string, FieldEvidenceSummary> = {};
    const title =
      String(product.normalized_name ?? "").trim() ||
      String(v.proposed_variant_sku ?? "").trim() ||
      "Staged product";

    rows.push({
      rowKind: "unified",
      stagingVariantId: String(v.id),
      stagingProductId: String(product.id),
      jobId: String(job.id),
      ingestionMode,
      jobStatus,
      reviewStatus,
      sourceUrl: String(v.source_url ?? product.source_url ?? ""),
      sourceFingerprint: String(job.source_fingerprint ?? product.source_fingerprint ?? ""),
      productFingerprint: String(v.product_fingerprint ?? product.product_fingerprint ?? ""),
      blockedReason: job.blocked_reason ? String(job.blocked_reason) : null,
      duplicateOf,
      mediaStatus: String(v.media_status ?? product.media_status ?? "pending"),
      title,
      primaryImageUrl: v.primary_image_url ? String(v.primary_image_url) : null,
      promotedCatalogProductId: product.promoted_catalog_product_id
        ? String(product.promoted_catalog_product_id)
        : null,
      promotedCatalogVariantId: v.promoted_catalog_variant_id
        ? String(v.promoted_catalog_variant_id)
        : null,
      catalogosUrlImportJobId: lineage.url_import_job_id ?? null,
      catalogosUrlImportProductId: lineage.url_import_product_id ?? null,
      sourceBatchId: product.source_batch_id ? String(product.source_batch_id) : null,
      createdAt: String(v.created_at ?? product.created_at ?? job.created_at ?? ""),
      evidenceByField,
    });
    variantIds.push(String(v.id));
  }

  if (variantIds.length === 0) return dedupeUnifiedQueueRows(rows);

  const { data: evidenceRows, error: eErr } = await supabase
    .schema("catalog_v2")
    .from("ingestion_field_evidence")
    .select(
      "staging_variant_id, field_key, extracted_value, confidence, source_type, source_ref, extraction_method, created_at"
    )
    .in("staging_variant_id", variantIds);

  if (eErr) {
    console.error("[unified-review-queue] evidence", eErr.message);
    return dedupeUnifiedQueueRows(rows);
  }

  const evidenceByVariant = new Map<string, EvidenceRow[]>();
  for (const er of (evidenceRows ?? []) as EvidenceRow[]) {
    const list = evidenceByVariant.get(er.staging_variant_id) ?? [];
    list.push(er);
    evidenceByVariant.set(er.staging_variant_id, list);
  }

  for (const row of rows) {
    const agg = aggregateEvidenceByField(evidenceByVariant.get(row.stagingVariantId) ?? []);
    row.evidenceByField = Object.fromEntries(agg);
    const nameEv = row.evidenceByField.name;
    if (nameEv?.value && typeof nameEv.value === "string") {
      row.title = nameEv.value.slice(0, 300);
    }
    const imgEv = row.evidenceByField.image_url;
    if (!row.primaryImageUrl && imgEv?.value && typeof imgEv.value === "string") {
      row.primaryImageUrl = imgEv.value;
    }
  }

  return dedupeUnifiedQueueRows(rows);
}

export async function getUnifiedIngestionJobDetail(jobId: string) {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseAdmin() as any;
  const { data: job, error } = await supabase
    .schema("catalog_v2")
    .from("ingestion_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (error || !job) return null;
  return job as Record<string, unknown>;
}
