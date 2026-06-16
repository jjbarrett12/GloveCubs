import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  fetchStoreProductCommercialAttrsByProductIds,
  fetchStoreProductRowsByIds,
} from "@/lib/catalog/store-products";
import type { EducationHubCatalogCandidate } from "@/lib/education-hub/survey-catalog-matches";

const MAX_CANDIDATE_IDS = 120;

export type EducationHubCatalogFetchResult = {
  candidates: EducationHubCatalogCandidate[];
  catalogUnavailable: boolean;
};

/**
 * Active published catalog rows for home survey matching — newest first, bounded scan.
 */
export async function fetchEducationHubCatalogCandidates(): Promise<EducationHubCatalogFetchResult> {
  if (!isSupabaseConfigured()) {
    return { candidates: [], catalogUnavailable: true };
  }

  const supabase = getSupabaseAdmin() as any;
  const { data, error } = await supabase
    .schema("catalog_v2")
    .from("catalog_products")
    .select("id")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(MAX_CANDIDATE_IDS);

  if (error) {
    console.error("[education-hub] catalog_products fetch failed:", error.message);
    return { candidates: [], catalogUnavailable: true };
  }

  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id).filter(Boolean);
  if (ids.length === 0) {
    return { candidates: [], catalogUnavailable: false };
  }

  const [products, attrsByProduct] = await Promise.all([
    fetchStoreProductRowsByIds(ids),
    fetchStoreProductCommercialAttrsByProductIds(ids),
  ]);

  const candidates: EducationHubCatalogCandidate[] = products.map((product) => ({
    product,
    attrs: attrsByProduct.get(product.id) ?? {
      uses: [],
      industries: [],
      protection_tags: [],
      certifications: [],
    },
  }));

  return { candidates, catalogUnavailable: false };
}
