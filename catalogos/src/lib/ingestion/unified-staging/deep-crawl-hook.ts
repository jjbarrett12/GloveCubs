/**
 * Write unified staging from completed url_import_products (Deep Supplier Crawl).
 */

import { getSupabase, getSupabaseCatalogos } from "@/lib/db/client";
import { isUnifiedStagingWriteEnabled } from "../../../../../lib/unified-ingestion/config";
import {
  evidenceFromDeepNormalized,
  pickNormalizedBrand,
  pickNormalizedName,
} from "./evidence-mappers";
import { writeUnifiedStagingArtifacts } from "./writer";

export type SyncDeepCrawlToUnifiedStagingInput = {
  urlImportJobId: string;
  supplierId: string;
  createdBy?: string | null;
};

export type SyncDeepCrawlResult = {
  written: number;
  skipped: number;
  errors: string[];
};

/**
 * Idempotent per product: duplicate source fingerprints return blocked (counted as skipped).
 */
export async function syncDeepCrawlJobToUnifiedStaging(
  input: SyncDeepCrawlToUnifiedStagingInput
): Promise<SyncDeepCrawlResult> {
  if (!isUnifiedStagingWriteEnabled()) {
    return { written: 0, skipped: 0, errors: [] };
  }

  const client = getSupabase(true);
  const catalogos = getSupabaseCatalogos(true);

  const { data: job, error: jobErr } = await catalogos
    .from("url_import_jobs")
    .select("id, supplier_id, start_url")
    .eq("id", input.urlImportJobId)
    .single();

  if (jobErr || !job) {
    return { written: 0, skipped: 0, errors: [jobErr?.message ?? "url_import_job not found"] };
  }

  const { data: products, error: prodErr } = await catalogos
    .from("url_import_products")
    .select("id, source_url, normalized_payload, confidence, ai_used, inferred_base_sku")
    .eq("job_id", input.urlImportJobId);

  if (prodErr) {
    return { written: 0, skipped: 0, errors: [prodErr.message] };
  }

  let written = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const p of products ?? []) {
    const row = p as {
      id: string;
      source_url: string;
      normalized_payload: Record<string, unknown>;
      confidence: number;
      ai_used: boolean;
      inferred_base_sku: string | null;
    };
    const normalized = row.normalized_payload ?? {};
    const sourceUrl = row.source_url || (job as { start_url: string }).start_url;
    const evidence = evidenceFromDeepNormalized(normalized, sourceUrl, {
      confidence: Number(row.confidence) || 0.65,
      aiUsed: row.ai_used,
    });

    const result = await writeUnifiedStagingArtifacts(
      {
        mode: "deep_supplier_crawl",
        sourceUrl,
        supplierId: input.supplierId,
        createdBy: input.createdBy ?? null,
        lineage: {
          url_import_job_id: input.urlImportJobId,
          url_import_product_id: row.id,
        },
        identityKeys: {
          gtin: typeof normalized.gtin === "string" ? normalized.gtin : null,
          mpn: typeof normalized.mpn === "string" ? normalized.mpn : null,
          supplierSku:
            typeof normalized.sku === "string"
              ? normalized.sku
              : typeof normalized.supplier_sku === "string"
                ? normalized.supplier_sku
                : row.inferred_base_sku,
        },
        product: {
          normalizedName: pickNormalizedName(normalized),
          normalizedBrand: pickNormalizedBrand(normalized),
          rawPayload: normalized,
        },
        variants: [
          {
            sourceUrl,
            proposedVariantSku:
              (typeof normalized.sku === "string" ? normalized.sku : null) ??
              row.inferred_base_sku,
            variantKey: row.inferred_base_sku ?? row.id,
            primaryImageUrl:
              typeof normalized.image_url === "string"
                ? normalized.image_url
                : typeof normalized.image === "string"
                  ? normalized.image
                  : null,
            rawPayload: normalized,
            evidence,
          },
        ],
        requireHumanReview: Number(row.confidence) > 0 && Number(row.confidence) < 0.5,
      },
      client
    );

    if (result.ok) {
      written++;
    } else if (result.blockedDuplicateOf) {
      skipped++;
    } else {
      errors.push(`${row.id}: ${result.error}`);
    }
  }

  return { written, skipped, errors };
}
