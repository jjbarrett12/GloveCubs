/**
 * Product resolution engine: determine for each normalized row whether it is
 * existing family, existing variant, new offer on existing variant, duplicate, or new product.
 * Order: prior decision -> exact offer -> variant SKU -> family by base SKU -> similarity -> new.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";
import { flattenV2Metadata } from "@/lib/catalog/v2-master-product";
import { getMatchDecision } from "./match-decision-service";
import { resolveAlias } from "./alias-service";
import { findMatchingPattern, incrementPatternUsage } from "./sku-pattern-service";
import type { NormalizedRowForResolution, ResolutionCandidate } from "./types";
import { RESOLUTION_REASONS } from "./types";

const ATTRIBUTE_KEYS = [
  "brand",
  "material",
  "thickness_mil",
  "color",
  "grade",
  "packaging",
] as const;

function getAttr(row: NormalizedRowForResolution, key: string): string {
  const nd = row.normalized_data ?? {};
  const attrs = row.attributes ?? (nd.filter_attributes as Record<string, unknown>) ?? nd;
  const v = attrs[key] ?? nd[key];
  if (v == null) return "";
  return String(v).trim().toLowerCase();
}

function getSku(row: NormalizedRowForResolution): string {
  const nd = row.normalized_data ?? {};
  const raw = nd.supplier_sku ?? nd.sku;
  if (raw == null) return "";
  return String(raw).trim();
}

/**
 * 1) Prior match decision for this supplier + SKU.
 */
async function resolveByMatchDecision(
  row: NormalizedRowForResolution
): Promise<ResolutionCandidate | null> {
  const sku = getSku(row);
  if (!sku) return null;
  const decision = await getMatchDecision(row.supplier_id, sku);
  if (!decision) return null;
  return {
    candidate_family_id: decision.candidate_family_id,
    candidate_product_id: decision.candidate_product_id,
    match_type: decision.match_type,
    confidence: 0.98,
    reasons: [RESOLUTION_REASONS.PRIOR_DECISION],
  };
}

/**
 * 2) Exact supplier offer: same supplier + supplier_sku already has an offer -> that product.
 */
async function resolveByExactOffer(
  row: NormalizedRowForResolution
): Promise<ResolutionCandidate | null> {
  const sku = getSku(row);
  if (!sku) return null;
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .from("supplier_offers")
    .select("product_id")
    .eq("supplier_id", row.supplier_id)
    .eq("supplier_sku", sku)
    .eq("is_active", true)
    .maybeSingle();
  if (error || !data) return null;
  return {
    candidate_family_id: null,
    candidate_product_id: (data as { product_id: string }).product_id,
    match_type: "offer",
    confidence: 0.98,
    reasons: [RESOLUTION_REASONS.EXACT_OFFER],
  };
}

/**
 * 3) Existing product with same SKU (variant).
 */
async function resolveByVariantSku(row: NormalizedRowForResolution): Promise<ResolutionCandidate | null> {
  const sku = getSku(row);
  if (!sku) return null;
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .schema("catalog_v2")
    .from("catalog_products")
    .select("id")
    .eq("internal_sku", sku)
    .eq("status", "active")
    .maybeSingle();
  if (error || !data) return null;
  return {
    candidate_family_id: null,
    candidate_product_id: (data as { id: string }).id,
    match_type: "variant",
    confidence: 0.95,
    reasons: [RESOLUTION_REASONS.EXACT_VARIANT_SKU],
  };
}

/**
 * Check if row attributes agree with product attributes (brand, material, thickness, color, grade, packaging).
 * Only compares when both row and product have a value; grade/material use alias resolution for row.
 */
async function supportingAttributesAgree(
  row: NormalizedRowForResolution,
  productAttributes: Record<string, unknown>
): Promise<boolean> {
  const a = productAttributes;
  for (const key of ATTRIBUTE_KEYS) {
    const rowVal = getAttr(row, key);
    const productVal = (a[key] ?? "").toString().trim().toLowerCase();
    if (!rowVal || !productVal) continue;
    let rowNorm = rowVal;
    if (key === "grade" || key === "material") {
      const resolved = await resolveAlias(rowVal, key === "grade" ? "grade" : "material");
      rowNorm = (resolved ?? rowVal).toLowerCase();
    }
    if (rowNorm !== productVal) return false;
  }
  return true;
}

/**
 * 4) SKU pattern memory: parse full SKU via learned patterns, then resolve family/variant by base + size.
 * Requires SKU/base pattern match; for high confidence (auto-attach) also requires supporting attributes to agree.
 */
async function resolveBySkuPattern(
  row: NormalizedRowForResolution,
  categoryId: string
): Promise<ResolutionCandidate | null> {
  const sku = getSku(row);
  if (!sku) return null;
  const parsed = await findMatchingPattern(row.supplier_id, sku);
  if (!parsed) return null;

  const supabase = getSupabaseCatalogos(true);
  const { data: family, error: famErr } = await supabase
    .from("product_families")
    .select("id")
    .eq("base_sku", parsed.base_sku)
    .eq("category_id", categoryId)
    .maybeSingle();
  if (famErr || !family) return null;
  const familyId = (family as { id: string }).id;
  const size = (parsed.suffix_value || (row.inferred_size ?? getAttr(row, "size"))).toLowerCase();
  if (size) {
    const { data: variants } = await supabase
      .schema("catalog_v2")
      .from("catalog_products")
      .select("id, metadata")
      .eq("status", "active")
      .filter("metadata->>family_id", "eq", familyId)
      .limit(50);
    const bySize = (variants ?? []).find((p: { metadata?: unknown }) => {
      const a = flattenV2Metadata(p.metadata);
      return String(a.size ?? "").toLowerCase() === size;
    });
    if (bySize) {
      const productAttrs = flattenV2Metadata((bySize as { metadata?: unknown }).metadata);
      const attributesAgree = await supportingAttributesAgree(row, productAttrs);
      incrementPatternUsage(parsed.pattern_id).catch(() => {});
      return {
        candidate_family_id: familyId,
        candidate_product_id: (bySize as { id: string }).id,
        match_type: "variant",
        confidence: attributesAgree ? 0.92 : 0.85,
        reasons: [RESOLUTION_REASONS.SKU_PATTERN_FAMILY_AND_SIZE],
      };
    }
  }
  incrementPatternUsage(parsed.pattern_id).catch(() => {});
  return {
    candidate_family_id: familyId,
    candidate_product_id: null,
    match_type: "family",
    confidence: 0.88,
    reasons: [RESOLUTION_REASONS.SKU_PATTERN_FAMILY],
  };
}

/**
 * 5) Family by inferred base SKU; optionally variant in that family with same size.
 */
async function resolveByFamily(
  row: NormalizedRowForResolution,
  categoryId: string
): Promise<ResolutionCandidate | null> {
  const baseSku = row.inferred_base_sku?.trim();
  if (!baseSku) return null;
  const supabase = getSupabaseCatalogos(true);
  const { data: family, error: famErr } = await supabase
    .from("product_families")
    .select("id")
    .eq("base_sku", baseSku)
    .eq("category_id", categoryId)
    .maybeSingle();
  if (famErr || !family) return null;
  const familyId = (family as { id: string }).id;
  const size = (row.inferred_size ?? getAttr(row, "size")).toLowerCase();
  if (size) {
    const { data: variants } = await supabase
      .schema("catalog_v2")
      .from("catalog_products")
      .select("id, metadata")
      .eq("status", "active")
      .filter("metadata->>family_id", "eq", familyId)
      .limit(50);
    const bySize = (variants ?? []).find((p: { metadata?: unknown }) => {
      const a = flattenV2Metadata(p.metadata);
      return String(a.size ?? "").toLowerCase() === size;
    });
    if (bySize) {
      return {
        candidate_family_id: familyId,
        candidate_product_id: (bySize as { id: string }).id,
        match_type: "variant",
        confidence: 0.9,
        reasons: [RESOLUTION_REASONS.FAMILY_BASE_SKU_AND_SIZE],
      };
    }
  }
  return {
    candidate_family_id: familyId,
    candidate_product_id: null,
    match_type: "family",
    confidence: 0.85,
    reasons: [RESOLUTION_REASONS.FAMILY_BASE_SKU],
  };
}

/**
 * 6) Similarity: brand + normalized title + material + thickness + color + grade + packaging.
 * Grade and material are resolved via product_aliases so e.g. "food safe" matches "food_service_grade".
 */
async function resolveBySimilarity(
  row: NormalizedRowForResolution,
  categoryId: string
): Promise<ResolutionCandidate | null> {
  const supabase = getSupabaseCatalogos(true);
  const { data: products, error } = await supabase
    .schema("catalog_v2")
    .from("catalog_products")
    .select("id, name, metadata")
    .contains("metadata", { category_id: categoryId })
    .eq("status", "active")
    .limit(500);
  if (error || !products?.length) return null;

  const title = (row.normalized_data?.canonical_title ?? row.normalized_data?.name ?? "").toString().toLowerCase();
  const brand = getAttr(row, "brand");
  const materialRaw = getAttr(row, "material");
  const thickness = getAttr(row, "thickness_mil");
  const color = getAttr(row, "color");
  const gradeRaw = getAttr(row, "grade");
  const packaging = getAttr(row, "packaging");

  const [resolvedGrade, resolvedMaterial] = await Promise.all([
    gradeRaw ? resolveAlias(gradeRaw, "grade") : null,
    materialRaw ? resolveAlias(materialRaw, "material") : null,
  ]);
  const grade = resolvedGrade ?? gradeRaw;
  const material = resolvedMaterial ?? materialRaw;

  let best: { id: string; score: number } | null = null;
  for (const p of products as { id: string; name: string; metadata?: unknown }[]) {
    const a = flattenV2Metadata(p.metadata);
    let match = 0;
    let total = 0;
    if (brand) {
      total++;
      if (String(a.brand ?? "").toLowerCase() === brand) match++;
    }
    if (material) {
      total++;
      if (String(a.material ?? "").toLowerCase() === material) match++;
    }
    if (thickness) {
      total++;
      if (String(a.thickness_mil ?? "").toLowerCase() === thickness) match++;
    }
    if (color) {
      total++;
      if (String(a.color ?? "").toLowerCase() === color) match++;
    }
    if (grade) {
      total++;
      if (String(a.grade ?? "").toLowerCase() === grade) match++;
    }
    if (packaging) {
      total++;
      if (String(a.packaging ?? "").toLowerCase() === packaging) match++;
    }
    const name = (p.name ?? "").toLowerCase();
    const titleWords = title.split(/\s+/).filter((w) => w.length > 1);
    const nameMatch = titleWords.length ? titleWords.filter((w) => name.includes(w)).length / titleWords.length : 0;
    const attrScore = total > 0 ? match / total : 0;
    const score = attrScore * 0.7 + nameMatch * 0.3;
    if (score >= 0.5 && (!best || score > best.score)) best = { id: p.id, score };
  }
  if (!best || best.score < 0.5) return null;
  const isDuplicate = best.score >= 0.85;
  return {
    candidate_family_id: null,
    candidate_product_id: best.id,
    match_type: isDuplicate ? "duplicate" : "variant",
    confidence: Math.round(best.score * 100) / 100,
    reasons: [RESOLUTION_REASONS.SIMILARITY],
  };
}

/**
 * Resolve one normalized row to a list of candidates (best first).
 */
export async function resolveRow(
  row: NormalizedRowForResolution,
  categoryId: string
): Promise<ResolutionCandidate[]> {
  const candidates: ResolutionCandidate[] = [];

  const byDecision = await resolveByMatchDecision(row);
  if (byDecision) {
    candidates.push(byDecision);
    return candidates;
  }

  const byOffer = await resolveByExactOffer(row);
  if (byOffer) {
    candidates.push(byOffer);
    return candidates;
  }

  const byVariant = await resolveByVariantSku(row);
  if (byVariant) {
    candidates.push(byVariant);
    return candidates;
  }

  const byPattern = await resolveBySkuPattern(row, categoryId);
  if (byPattern) candidates.push(byPattern);

  const byFamily = await resolveByFamily(row, categoryId);
  if (byFamily) candidates.push(byFamily);

  const bySim = await resolveBySimilarity(row, categoryId);
  if (bySim) candidates.push(bySim);

  if (candidates.length === 0) {
    candidates.push({
      candidate_family_id: null,
      candidate_product_id: null,
      match_type: "new_product",
      confidence: 0,
      reasons: [RESOLUTION_REASONS.NO_MATCH],
    });
  }

  return candidates.sort((a, b) => b.confidence - a.confidence);
}
