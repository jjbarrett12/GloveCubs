/**
 * Promote unified staging variant → catalog_v2 draft (no live publish).
 */

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { insertCatalogProduct, type ProductWriteInput } from "@/lib/admin/product-write";
import type { FieldEvidenceSummary } from "@/lib/admin/unified-ingestion-review-queue";
import { canPromoteUnifiedStaging } from "@/lib/admin/unified-ingestion-promote-guards";
import type { IngestionJobStatus } from "@/lib/unified-ingestion/types";
import { parseImportDraftFromExtracted } from "@/lib/admin/import-draft-mapper";
import { importDraftToProductWriteInput } from "@/lib/admin/import-draft-promote";
import { parseIngestionJobLineage } from "@/lib/admin/review-queue-catalogos-handoff";

export type PromoteUnifiedStagingInput = {
  stagingVariantId: string;
  categoryId: string;
  confirmAwaitingHuman?: boolean;
  name?: string;
  brandName?: string;
  description?: string;
  primaryImageUrl?: string;
  variants?: ProductWriteInput["variants"];
};

export async function promoteUnifiedStagingVariant(
  input: PromoteUnifiedStagingInput,
  createdBy: string | null
): Promise<{ productId: string; variantId: string } | { error: string; status?: number }> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured.", status: 503 };
  }

  const supabase = getSupabaseAdmin() as any;
  const { data: variant, error: vErr } = await supabase
    .schema("catalog_v2")
    .from("catalog_staging_variants")
    .select(
      `
      id,
      staging_product_id,
      source_url,
      primary_image_url,
      proposed_variant_sku,
      status,
      promoted_catalog_variant_id,
      raw_payload,
      catalog_staging_products!inner (
        id,
        review_status,
        normalized_name,
        normalized_brand,
        source_url,
        promoted_catalog_product_id,
        raw_payload,
        ingestion_jobs!inner ( id, status, blocked_reason, lineage )
      )
    `
    )
    .eq("id", input.stagingVariantId)
    .maybeSingle();

  if (vErr || !variant) {
    return { error: "Staging variant not found.", status: 404 };
  }

  const v = variant as Record<string, unknown>;
  const product = v.catalog_staging_products as Record<string, unknown>;
  const job = product.ingestion_jobs as Record<string, unknown>;
  const jobStatus = String(job.status) as IngestionJobStatus;
  const lineage = parseIngestionJobLineage(job.lineage);

  const reviewStatus = String(product.review_status);
  const guard = canPromoteUnifiedStaging({
    jobStatus,
    reviewStatus,
    alreadyPromoted: Boolean(product.promoted_catalog_product_id || v.promoted_catalog_variant_id),
    confirmAwaitingHuman: Boolean(input.confirmAwaitingHuman),
    catalogosUrlImportJobId: lineage.url_import_job_id ?? null,
  });
  if (!guard.ok) {
    return { error: guard.error, status: guard.status };
  }

  const sourceUrl = String(v.source_url ?? product.source_url ?? "");
  const rawPayload =
    (v.raw_payload && typeof v.raw_payload === "object" ? (v.raw_payload as Record<string, unknown>) : null) ??
    (product.raw_payload && typeof product.raw_payload === "object"
      ? (product.raw_payload as Record<string, unknown>)
      : {});

  const draft = parseImportDraftFromExtracted(rawPayload, sourceUrl);
  if (!draft) {
    return { error: "Staging variant has no import draft to promote.", status: 400 };
  }

  const merged = importDraftToProductWriteInput(
    draft,
    {
      category_id: input.categoryId,
      name: input.name,
      brand_name: input.brandName,
      description: input.description,
      primary_image_url: input.primaryImageUrl,
      variants: input.variants,
    },
    {
      stagingImageUrl:
        input.primaryImageUrl?.trim() ||
        String(v.primary_image_url ?? "").trim() ||
        null,
    }
  );

  const created = await insertCatalogProduct(merged);
  if ("error" in created) {
    return { error: created.error, status: 400 };
  }

  const productId = created.id;

  const { data: catalogVariant } = await supabase
    .schema("catalog_v2")
    .from("catalog_variants")
    .select("id")
    .eq("catalog_product_id", productId)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  const variantId = (catalogVariant as { id: string } | null)?.id;
  if (!variantId) {
    return { error: "Draft product created but variant row missing.", status: 500 };
  }

  const now = new Date().toISOString();
  await supabase
    .schema("catalog_v2")
    .from("catalog_staging_products")
    .update({
      review_status: "promoted_to_draft",
      status: "promoted",
      promoted_catalog_product_id: productId,
      updated_at: now,
    })
    .eq("id", product.id);

  await supabase
    .schema("catalog_v2")
    .from("catalog_staging_variants")
    .update({
      status: "promoted",
      promoted_catalog_variant_id: variantId,
      updated_at: now,
    })
    .eq("id", input.stagingVariantId);

  void createdBy;
  return { productId, variantId };
}
