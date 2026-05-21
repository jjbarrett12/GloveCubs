/** Shared unified ingestion contracts (catalog_v2). */

export const INGESTION_MODES = ["quick_draft", "deep_supplier_crawl"] as const;
export type IngestionMode = (typeof INGESTION_MODES)[number];

export const INGESTION_JOB_STATUSES = [
  "queued",
  "fetching",
  "extracting",
  "normalized",
  "review_ready",
  "publish_ready",
  "blocked",
  "awaiting_human",
  "failed",
] as const;
export type IngestionJobStatus = (typeof INGESTION_JOB_STATUSES)[number];

export type IngestionLineage = {
  url_import_job_id?: string;
  url_import_product_id?: string;
  clipboard_staging_id?: string;
  import_batch_id?: string;
};

export type FieldEvidenceInput = {
  fieldKey: string;
  value: unknown;
  confidence: number;
  sourceType: string;
  sourceRef?: string | null;
  sourceSnippet?: string | null;
  extractionMethod?: "deterministic" | "ai_fallback";
};

export type UnifiedStagingProductInput = {
  normalizedName?: string | null;
  normalizedBrand?: string | null;
  rawPayload?: Record<string, unknown>;
};

export type UnifiedStagingVariantInput = {
  proposedVariantSku?: string | null;
  sourceUrl: string;
  primaryImageUrl?: string | null;
  variantKey?: string | null;
  rawPayload?: Record<string, unknown>;
  evidence: FieldEvidenceInput[];
};

export type WriteUnifiedStagingInput = {
  mode: IngestionMode;
  sourceUrl: string;
  supplierId?: string | null;
  createdBy?: string | null;
  lineage?: IngestionLineage;
  metadata?: Record<string, unknown>;
  identityKeys?: {
    gtin?: string | null;
    mpn?: string | null;
    supplierSku?: string | null;
  };
  product: UnifiedStagingProductInput;
  variants: UnifiedStagingVariantInput[];
  /** When true, low aggregate confidence sets awaiting_human instead of review_ready. */
  requireHumanReview?: boolean;
};

export type WriteUnifiedStagingResult =
  | {
      ok: true;
      jobId: string;
      status: IngestionJobStatus;
      stagingProductId: string;
      stagingVariantIds: string[];
      sourceFingerprint: string;
      blockedDuplicateOf?: string;
    }
  | {
      ok: false;
      error: string;
      blockedDuplicateOf?: string;
    };
