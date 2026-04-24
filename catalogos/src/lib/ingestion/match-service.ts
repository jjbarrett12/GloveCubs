/**
 * Match normalized row to master catalog.
 * Order: UPC exact -> attribute match (brand, material, color, size, thickness, case_qty) -> fuzzy title.
 * Returns confidence and reason; low confidence must go to review queue.
 */

import type { NormalizedData, MatchResult } from "./types";
import { getSupabaseCatalogos } from "@/lib/db/client";
import { v2RowToMasterShape } from "@/lib/catalog/v2-master-product";

const LOW_CONFIDENCE_THRESHOLD = 0.6;

export interface MasterProductRow {
  id: string;
  sku: string;
  name: string;
  category_id: string;
  attributes: Record<string, unknown>;
}

export interface MatchInput {
  normalized: NormalizedData;
  categoryId: string;
  supplierSku?: string;
  /**
   * When set (e.g. one load per batch), avoids N+1 queries to catalogos.products.
   */
  masterCandidates?: MasterProductRow[];
}

/**
 * Load master products for the category (disposable_gloves). Used for matching.
 */
export async function loadMasterProducts(categoryId: string): Promise<MasterProductRow[]> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .schema("catalog_v2")
    .from("catalog_products")
    .select("id, internal_sku, name, metadata")
    .eq("status", "active")
    .contains("metadata", { category_id: categoryId });

  if (error) throw new Error(`Failed to load master products: ${error.message}`);
  return (data ?? []).map((r) => v2RowToMasterShape(r as { id: string; internal_sku: string | null; name: string; metadata: unknown }));
}

/**
 * Match normalized row to master catalog. Order: UPC exact, then attribute match, then fuzzy title.
 */
export async function matchToMaster(input: MatchInput): Promise<MatchResult> {
  const candidates = input.masterCandidates ?? (await loadMasterProducts(input.categoryId));
  if (candidates.length === 0) {
    return { masterProductId: null, confidence: 0, reason: "no_match" };
  }

  const upc = normalizeUpc(input.normalized.upc);
  if (upc) {
    const byUpc = candidates.find((p) => {
      const a = (p.attributes ?? {}) as Record<string, unknown>;
      const pu = normalizeUpc(String(a.upc ?? a.gtin ?? ""));
      return pu && pu === upc;
    });
    if (byUpc) return { masterProductId: byUpc.id, confidence: 0.98, reason: "upc_exact" };
  }

  const bySku = input.supplierSku
    ? candidates.find((p) => p.sku.toLowerCase() === input.supplierSku!.toLowerCase())
    : null;
  if (bySku) return { masterProductId: bySku.id, confidence: 0.85, reason: "attribute_match" };

  const attrScore = matchByAttributes(input.normalized, candidates);
  if (attrScore.masterProductId && attrScore.confidence >= LOW_CONFIDENCE_THRESHOLD) {
    return { ...attrScore, reason: "attribute_match" };
  }

  const fuzzy = fuzzyTitleMatch(input.normalized.name ?? "", candidates);
  if (fuzzy.masterProductId && fuzzy.confidence >= LOW_CONFIDENCE_THRESHOLD) {
    return { ...fuzzy, reason: "fuzzy_title" };
  }

  return {
    masterProductId: attrScore.masterProductId ?? fuzzy.masterProductId ?? null,
    confidence: Math.max(attrScore.confidence, fuzzy.confidence, 0),
    reason: "no_match",
  };
}

function normalizeUpc(v: string | undefined): string {
  if (!v) return "";
  return v.replace(/\D/g, "").slice(0, 14);
}

function matchByAttributes(
  normalized: NormalizedData,
  candidates: MasterProductRow[]
): { masterProductId: string | null; confidence: number } {
  const attrs = normalized.attributes ?? {};
  let best: { id: string; score: number } | null = null;

  for (const p of candidates) {
    const a = (p.attributes ?? {}) as Record<string, unknown>;
    let match = 0;
    let total = 0;

    const nb = normalized.brand;
    const pb = a.brand;
    if (nb != null && String(nb).trim() !== "" && pb != null && String(pb).trim() !== "") {
      total++;
      if (String(nb).toLowerCase() === String(pb).toLowerCase()) match++;
    }

    const pairs: [keyof typeof attrs, string][] = [
      ["material", "material"],
      ["color", "color"],
      ["size", "size"],
      ["thickness_mil", "thickness_mil"],
      ["case_qty", "case_qty"],
    ];

    for (const [k, dbKey] of pairs) {
      const v = attrs[k];
      const pv = a[dbKey];
      if (v == null && pv == null) continue;
      total++;
      if (v != null && pv != null && String(v).toLowerCase() === String(pv).toLowerCase()) match++;
    }

    if (total === 0) continue;
    const score = match / total;
    if (!best || score > best.score) best = { id: p.id, score };
  }

  if (!best) return { masterProductId: null, confidence: 0 };
  return { masterProductId: best.id, confidence: Math.round(best.score * 100) / 100 };
}

function fuzzyTitleMatch(
  title: string,
  candidates: MasterProductRow[]
): { masterProductId: string | null; confidence: number } {
  if (!title || title.length < 3) return { masterProductId: null, confidence: 0 };

  const words = title.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  let best: { id: string; score: number } | null = null;

  for (const p of candidates) {
    const name = (p.name ?? "").toLowerCase();
    const matched = words.filter((w) => name.includes(w)).length;
    const score = words.length > 0 ? matched / words.length : 0;
    if (score >= 0.5 && (!best || score > best.score)) best = { id: p.id, score };
  }

  if (!best) return { masterProductId: null, confidence: 0 };
  return { masterProductId: best.id, confidence: Math.min(0.75, Math.round(best.score * 100) / 100) };
}

export { LOW_CONFIDENCE_THRESHOLD };
