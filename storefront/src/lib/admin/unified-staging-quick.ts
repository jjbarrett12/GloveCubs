/**
 * Quick Draft → catalog_v2 unified staging (storefront; no CatalogOS required).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isUnifiedStagingWriteEnabled } from "@/lib/unified-ingestion/config";
import {
  evidenceFromQuickExtracted,
  pickNormalizedBrand,
  pickNormalizedName,
} from "@/lib/unified-ingestion/evidence-mappers";
import { writeUnifiedStagingArtifacts } from "@/lib/unified-ingestion/writer";
import { parseImportDraftFromExtracted } from "@/lib/admin/import-draft-mapper";

export type QuickUnifiedStagingInput = {
  productPageUrl: string;
  imageUrl?: string | null;
  extracted: Record<string, unknown>;
  createdBy?: string | null;
  clipboardStagingId?: string | null;
  supplierId?: string | null;
  requireHumanReview?: boolean;
};

export async function writeQuickDraftUnifiedStaging(
  supabase: SupabaseClient,
  input: QuickUnifiedStagingInput
): Promise<{ ok: true; jobId: string; stagingVariantId: string } | { ok: false; error: string }> {
  if (!isUnifiedStagingWriteEnabled()) {
    return { ok: false, error: "UNIFIED_STAGING_WRITE is disabled." };
  }

  const sourceUrl = input.productPageUrl;
  const draft = parseImportDraftFromExtracted(input.extracted, sourceUrl);
  const imageUrl =
    input.imageUrl ??
    (typeof input.extracted.source_image_url === "string"
      ? input.extracted.source_image_url
      : typeof input.extracted.suggested_image_from_page === "string"
        ? input.extracted.suggested_image_from_page
        : draft?.image_url ?? null);

  const variantDrafts =
    draft && draft.variants.length > 0
      ? draft.variants
      : [
          {
            size_label: null,
            normalized_size_code: "UNKNOWN",
            sku: draft?.sku ?? null,
            mpn: draft?.mpn ?? null,
            gtin: null,
            list_price: null,
          },
        ];

  const stagingVariants = variantDrafts.map((v, idx) => {
    const variantKey = "normalized_size_code" in v ? v.normalized_size_code || `variant-${idx}` : `variant-${idx}`;
    const evidence = evidenceFromQuickExtracted(input.extracted, sourceUrl);
    return {
      sourceUrl,
      primaryImageUrl: imageUrl,
      variantKey,
      proposedVariantSku: v.sku ?? v.mpn ?? draft?.sku ?? null,
      rawPayload: input.extracted,
      evidence,
    };
  });

  const result = await writeUnifiedStagingArtifacts(
    {
      mode: "quick_draft",
      sourceUrl,
      supplierId: input.supplierId ?? null,
      createdBy: input.createdBy ?? null,
      lineage: {
        clipboard_staging_id: input.clipboardStagingId ?? undefined,
      },
      product: {
        normalizedName: pickNormalizedName(input.extracted),
        normalizedBrand: pickNormalizedBrand(input.extracted),
        rawPayload: input.extracted,
      },
      variants: stagingVariants,
      requireHumanReview:
        Boolean(input.requireHumanReview) ||
        (typeof input.extracted.fetch_error === "string" && input.extracted.fetch_error.length > 0),
    },
    supabase
  );

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  const stagingVariantId = result.stagingVariantIds[0];
  if (!stagingVariantId) {
    return { ok: false, error: "Unified staging wrote no variant." };
  }

  return { ok: true, jobId: result.jobId, stagingVariantId };
}
