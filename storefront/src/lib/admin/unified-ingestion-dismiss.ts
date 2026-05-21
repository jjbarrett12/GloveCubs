/**
 * Dismiss unified staging variant — preserves evidence; may terminalize job.
 */

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";

export async function dismissUnifiedStagingVariant(
  stagingVariantId: string
): Promise<{ ok: true } | { error: string; status?: number }> {
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
      catalog_staging_products!inner (
        id,
        review_status,
        ingestion_job_id
      )
    `
    )
    .eq("id", stagingVariantId)
    .maybeSingle();

  if (vErr || !variant) {
    return { error: "Staging variant not found.", status: 404 };
  }

  const v = variant as Record<string, unknown>;
  const product = v.catalog_staging_products as Record<string, unknown>;
  if (String(product.review_status) !== "needs_review") {
    return { error: "Only rows awaiting review can be dismissed.", status: 409 };
  }

  const now = new Date().toISOString();
  const productId = String(product.id);
  const jobId = product.ingestion_job_id ? String(product.ingestion_job_id) : null;

  await supabase
    .schema("catalog_v2")
    .from("catalog_staging_products")
    .update({ review_status: "dismissed", status: "rejected", updated_at: now })
    .eq("id", productId)
    .eq("review_status", "needs_review");

  await supabase
    .schema("catalog_v2")
    .from("catalog_staging_variants")
    .update({ status: "rejected", updated_at: now })
    .eq("id", stagingVariantId);

  if (jobId) {
    const { data: jobProducts } = await supabase
      .schema("catalog_v2")
      .from("catalog_staging_products")
      .select("review_status")
      .eq("ingestion_job_id", jobId);

    const allDismissed = (jobProducts ?? []).every(
      (p: { review_status: string }) => p.review_status !== "needs_review"
    );

    if (allDismissed && (jobProducts ?? []).length > 0) {
      await supabase
        .schema("catalog_v2")
        .from("ingestion_jobs")
        .update({
          status: "failed",
          failed_reason: "operator_dismissed_all_variants",
          updated_at: now,
        })
        .eq("id", jobId)
        .neq("status", "failed");
    }
  }

  return { ok: true };
}
