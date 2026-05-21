/**
 * Promote unified staging variant → catalog_v2 draft (no live publish).
 */

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  insertCatalogProduct,
  type ProductWriteInput,
} from "@/lib/admin/product-write";
import type { FieldEvidenceSummary } from "@/lib/admin/unified-ingestion-review-queue";
import { canPromoteUnifiedStaging } from "@/lib/admin/unified-ingestion-promote-guards";
import type { IngestionJobStatus } from "../../../../lib/unified-ingestion/types";

function strEvidence(
  evidence: Record<string, FieldEvidenceSummary>,
  key: string
): string {
  const v = evidence[key]?.value;
  return typeof v === "string" ? v.trim() : v != null ? String(v) : "";
}

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
      catalog_staging_products!inner (
        id,
        review_status,
        normalized_name,
        normalized_brand,
        source_url,
        promoted_catalog_product_id,
        ingestion_jobs!inner ( id, status, blocked_reason )
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

  const reviewStatus = String(product.review_status);
  const guard = canPromoteUnifiedStaging({
    jobStatus,
    reviewStatus,
    alreadyPromoted: Boolean(product.promoted_catalog_product_id || v.promoted_catalog_variant_id),
    confirmAwaitingHuman: Boolean(input.confirmAwaitingHuman),
  });
  if (!guard.ok) {
    return { error: guard.error, status: guard.status };
  }

  const { data: evidenceRows } = await supabase
    .schema("catalog_v2")
    .from("ingestion_field_evidence")
    .select("field_key, extracted_value, confidence, source_type, source_ref, extraction_method, created_at")
    .eq("staging_variant_id", input.stagingVariantId);

  const evidenceByField: Record<string, FieldEvidenceSummary> = {};
  const latestAt: Record<string, string> = {};
  for (const er of evidenceRows ?? []) {
    const row = er as {
      field_key: string;
      extracted_value: unknown;
      confidence: number;
      source_type: string;
      source_ref: string | null;
      extraction_method: string;
      created_at: string;
    };
    const prevAt = latestAt[row.field_key];
    if (!prevAt || row.created_at > prevAt) {
      latestAt[row.field_key] = row.created_at;
      evidenceByField[row.field_key] = {
        value: row.extracted_value,
        confidence: Number(row.confidence) || 0,
        sourceType: row.source_type,
        sourceRef: row.source_ref,
        extractionMethod: row.extraction_method,
      };
    }
  }

  const sourceUrl = String(v.source_url ?? product.source_url ?? "");
  const name =
    input.name?.trim() ||
    strEvidence(evidenceByField, "name") ||
    String(product.normalized_name ?? "").trim() ||
    "Imported listing";

  const brandName =
    input.brandName?.trim() ||
    strEvidence(evidenceByField, "brand") ||
    String(product.normalized_brand ?? "").trim();

  const baseDesc = strEvidence(evidenceByField, "description");
  const description = [baseDesc, input.description?.trim(), sourceUrl ? `Source: ${sourceUrl}` : ""]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 12000);

  const primaryImageUrl =
    input.primaryImageUrl?.trim() ||
    String(v.primary_image_url ?? "").trim() ||
    strEvidence(evidenceByField, "image_url");

  const suggestedSku =
    strEvidence(evidenceByField, "sku") ||
    strEvidence(evidenceByField, "mpn") ||
    String(v.proposed_variant_sku ?? "").trim();

  const merged: ProductWriteInput = {
    name: name.slice(0, 300),
    brandName,
    categoryId: input.categoryId,
    material: "",
    color: "",
    milThickness: "",
    casePack: "",
    description,
    primaryImageUrl,
    status: "draft",
    quoteOnly: true,
    variants: input.variants?.length
      ? input.variants
      : [{ sizeCode: "OS", variantSku: suggestedSku, listPrice: "" }],
  };

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
