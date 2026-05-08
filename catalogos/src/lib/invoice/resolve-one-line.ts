import { runNormalization } from "@/lib/normalization/normalization-engine";
import { matchToMaster } from "@/lib/ingestion/match-service";
import { normalizedDataFromInvoiceNormalization } from "@/lib/invoice/normalized-data-from-result";
import { getSupabaseCatalogos } from "@/lib/db/client";
import type { CategorySlug } from "@/lib/catalogos/attribute-dictionary-types";

async function resolveCategoryIdBySlug(slug: string): Promise<string> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase.from("categories").select("id").eq("slug", slug).single();
  if (error || !data?.id) throw new Error(`Category not found: ${slug}`);
  return data.id as string;
}

export type ResolveOneLineOutput = {
  line_id: string;
  matched: boolean;
  catalog_product_id: string | null;
  match_confidence: number;
  match_reason: string;
  category_slug: string;
  normalized_snapshot: Record<string, unknown>;
};

export async function resolveOneInvoiceLine(lineId: string, row: Record<string, unknown>): Promise<ResolveOneLineOutput> {
  let normResult;
  try {
    normResult = runNormalization(row, {
      categoryHint: "disposable_gloves",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "normalization_failed";
    return {
      line_id: lineId,
      matched: false,
      catalog_product_id: null,
      match_confidence: 0,
      match_reason: "no_match",
      category_slug: "disposable_gloves",
      normalized_snapshot: { error: msg, row },
    };
  }

  const slug = normResult.category_slug as CategorySlug;
  let categoryId: string;
  try {
    categoryId = await resolveCategoryIdBySlug(slug);
  } catch {
    return {
      line_id: lineId,
      matched: false,
      catalog_product_id: null,
      match_confidence: 0,
      match_reason: "no_match",
      category_slug: slug,
      normalized_snapshot: {
        category_slug: slug,
        error: "category_resolve_failed",
      },
    };
  }

  const normalized = normalizedDataFromInvoiceNormalization(normResult);
  const rulesMatch = await matchToMaster({
    normalized,
    categoryId,
    supplierSku: normalized.sku,
  });

  return {
    line_id: lineId,
    matched: rulesMatch.matched,
    catalog_product_id: rulesMatch.masterProductId,
    match_confidence: rulesMatch.confidence,
    match_reason: rulesMatch.reason,
    category_slug: slug,
    normalized_snapshot: {
      category_slug: slug,
      category_inference: normResult.category_inference,
      filter_attributes: normResult.filter_attributes,
      content: {
        canonical_title: normResult.content.canonical_title,
        supplier_sku: normResult.content.supplier_sku,
        supplier_cost: normResult.content.supplier_cost,
        brand: normResult.content.brand,
      },
      review_flags: normResult.review_flags,
    },
  };
}
