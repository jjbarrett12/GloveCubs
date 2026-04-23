import type { MasterProduct } from "@/types/catalogos";

export interface MatchInput {
  upc?: string | null;
  attributes: Record<string, unknown>;
  category: string;
  supplier_sku?: string;
}

export interface MatchResult {
  master_product_id: number | null;
  master_product: MasterProduct | null;
  confidence: number;
  reason: string;
}

/**
 * Match normalized staging data to master products.
 * UPC is strongest signal; then attribute similarity.
 */
export function matchToMaster(
  input: MatchInput,
  candidates: MasterProduct[]
): MatchResult {
  if (candidates.length === 0) {
    return { master_product_id: null, master_product: null, confidence: 0, reason: "no_candidates" };
  }

  const upc = (input.upc ?? "").toString().trim().replace(/\D/g, "");
  if (upc.length >= 10) {
    const byUpc = candidates.find((m) => {
      const mUpc = (m.attributes?.upc ?? (m.attributes as Record<string, unknown>)?.upc)
        ?.toString()
        ?.trim()
        ?.replace(/\D/g, "");
      return mUpc && mUpc === upc;
    });
    if (byUpc) {
      return {
        master_product_id: byUpc.id,
        master_product: byUpc,
        confidence: 0.98,
        reason: "upc_match",
      };
    }
  }

  const bySku = input.supplier_sku
    ? candidates.find((m) => m.sku.toLowerCase() === input.supplier_sku!.toLowerCase())
    : null;
  if (bySku) {
    return {
      master_product_id: bySku.id,
      master_product: bySku,
      confidence: 0.85,
      reason: "sku_match",
    };
  }

  let best: { master: MasterProduct; score: number } | null = null;
  for (const m of candidates) {
    const score = attributeSimilarity(input.attributes, m.attributes ?? {});
    if (!best || score > best.score) best = { master: m, score };
  }
  if (best && best.score >= 0.5) {
    return {
      master_product_id: best.master.id,
      master_product: best.master,
      confidence: Math.round(best.score * 100) / 100,
      reason: "attribute_similarity",
    };
  }

  return { master_product_id: null, master_product: null, confidence: 0, reason: "no_match" };
}

function attributeSimilarity(a: Record<string, unknown>, b: Record<string, unknown>): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let match = 0;
  let total = 0;
  for (const k of keys) {
    const va = a[k];
    const vb = b[k];
    if (va == null && vb == null) continue;
    total++;
    if (va == null || vb == null) continue;
    const sa = String(va).toLowerCase().trim();
    const sb = String(vb).toLowerCase().trim();
    if (sa === sb) match++;
    else if (sa && sb && (sa.includes(sb) || sb.includes(sa))) match += 0.5;
  }
  return total === 0 ? 0 : match / total;
}
