/**
 * Product Matching Agent — duplicate master detection.
 * Find pairs of master products (same category) with high attribute + title similarity.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";
import { scoreAttributes, scoreTitleSimilarity } from "./scoring";
import type { MasterForScoring } from "./scoring";

const DUPLICATE_PAIR_THRESHOLD = 0.88;

export interface DuplicatePair {
  product_id_a: string;
  product_id_b: string;
  score: number;
  reason: string;
}

/**
 * Find pairs of master products in the same category that look like duplicates.
 */
export async function findDuplicateCandidates(
  categoryId: string
): Promise<DuplicatePair[]> {
  const supabase = getSupabaseCatalogos(true);
  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, category_id, attributes")
    .eq("category_id", categoryId)
    .eq("is_active", true);

  if (error || !products?.length) return [];

  const masters: MasterForScoring[] = (products as { id: string; name: string; attributes: Record<string, unknown> }[]).map(
    (p) => ({ id: p.id, name: p.name, attributes: p.attributes ?? {} })
  );

  const pairs: DuplicatePair[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < masters.length; i++) {
    for (let j = i + 1; j < masters.length; j++) {
      const a = masters[i];
      const b = masters[j];
      const key = [a.id, b.id].sort().join(":");
      if (seen.has(key)) continue;

      const { score: attrScore } = scoreAttributes(
        { filter_attributes: a.attributes as Record<string, unknown>, name: a.name },
        b
      );
      const titleScore = scoreTitleSimilarity(a.name, b.name);
      const combined = attrScore * 0.7 + titleScore * 0.3;
      if (combined >= DUPLICATE_PAIR_THRESHOLD) {
        seen.add(key);
        const [idA, idB] = [a.id, b.id].sort();
        pairs.push({
          product_id_a: idA,
          product_id_b: idB,
          score: Math.round(combined * 100) / 100,
          reason: `attribute_overlap=${Math.round(attrScore * 100)}% title_overlap=${Math.round(titleScore * 100)}%`,
        });
      }
    }
  }

  return pairs;
}

/**
 * Build set of product IDs that appear in any duplicate pair (for match duplicate_warning).
 */
export function productIdsInDuplicatePairs(pairs: DuplicatePair[]): Set<string> {
  const set = new Set<string>();
  for (const p of pairs) {
    set.add(p.product_id_a);
    set.add(p.product_id_b);
  }
  return set;
}
