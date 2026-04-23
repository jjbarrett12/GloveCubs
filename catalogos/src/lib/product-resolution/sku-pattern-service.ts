/**
 * SKU pattern memory: store and reuse learned family/variant SKU patterns by supplier and/or brand.
 * Examples: GL-N125F base family SKU; S/M/L/XL suffix means size.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";

export interface SkuPatternRow {
  id: string;
  brand_id: string | null;
  supplier_id: string | null;
  base_sku_pattern: string;
  suffix_type: string;
  suffix_values: string[];
  example_skus: string[];
  usage_count: number;
}

export interface ParsedSku {
  base_sku: string;
  suffix_type: string;
  suffix_value: string;
  pattern_id: string;
}

/** Default delimiter between base and suffix (e.g. GL-N125F-M). */
const DEFAULT_SUFFIX_DELIMITER = "-";

/**
 * Get all SKU patterns for a supplier (and optionally brand).
 */
export async function getPatternsBySupplier(supplierId: string): Promise<SkuPatternRow[]> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .from("sku_pattern_memory")
    .select("id, brand_id, supplier_id, base_sku_pattern, suffix_type, suffix_values, example_skus, usage_count")
    .eq("supplier_id", supplierId)
    .order("usage_count", { ascending: false });
  if (error) return [];
  return (data ?? []).map((r) => ({
    ...r,
    suffix_values: Array.isArray(r.suffix_values) ? r.suffix_values : [],
    example_skus: Array.isArray(r.example_skus) ? r.example_skus : [],
  })) as SkuPatternRow[];
}

/**
 * Get all SKU patterns for a brand.
 */
export async function getPatternsByBrand(brandId: string): Promise<SkuPatternRow[]> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .from("sku_pattern_memory")
    .select("id, brand_id, supplier_id, base_sku_pattern, suffix_type, suffix_values, example_skus, usage_count")
    .eq("brand_id", brandId)
    .order("usage_count", { ascending: false });
  if (error) return [];
  return (data ?? []).map((r) => ({
    ...r,
    suffix_values: Array.isArray(r.suffix_values) ? r.suffix_values : [],
    example_skus: Array.isArray(r.example_skus) ? r.example_skus : [],
  })) as SkuPatternRow[];
}

/**
 * Try to parse full SKU using stored patterns: find a pattern where SKU = base or base + delimiter + known suffix.
 */
export async function findMatchingPattern(
  supplierId: string,
  fullSku: string,
  brandId?: string | null
): Promise<ParsedSku | null> {
  const sku = fullSku.trim();
  if (!sku) return null;

  const bySupplier = await getPatternsBySupplier(supplierId);
  const byBrand = brandId ? await getPatternsByBrand(brandId) : [];
  const patterns = bySupplier.length ? bySupplier : byBrand;
  if (patterns.length === 0) return null;

  const skuLower = sku.toLowerCase();
  for (const p of patterns) {
    const baseLower = p.base_sku_pattern.trim().toLowerCase();
    if (skuLower === baseLower) {
      return { base_sku: p.base_sku_pattern, suffix_type: p.suffix_type, suffix_value: "", pattern_id: p.id };
    }
    if (!skuLower.startsWith(baseLower)) continue;
    const remainder = sku.slice(baseLower.length).replace(/^[-_\s]+/, "").trim();
    if (!remainder) {
      return { base_sku: p.base_sku_pattern, suffix_type: p.suffix_type, suffix_value: "", pattern_id: p.id };
    }
    const suffixLower = remainder.toLowerCase();
    const hasSuffix = p.suffix_values.some((s) => String(s).trim().toLowerCase() === suffixLower);
    if (hasSuffix) {
      return { base_sku: p.base_sku_pattern, suffix_type: p.suffix_type, suffix_value: remainder, pattern_id: p.id };
    }
  }
  return null;
}

/**
 * Record or update a SKU pattern (e.g. after admin approves a family/variant with high confidence).
 * At least one of supplierId or brandId must be set.
 */
export async function upsertPattern(params: {
  supplierId?: string | null;
  brandId?: string | null;
  baseSkuPattern: string;
  suffixType?: string;
  suffixValues?: string[];
  exampleSku?: string;
}): Promise<{ id: string } | null> {
  const { supplierId, brandId, baseSkuPattern, suffixType = "size", suffixValues = [], exampleSku } = params;
  if (!supplierId && !brandId) return null;
  const base = baseSkuPattern.trim();
  if (!base) return null;

  const supabase = getSupabaseCatalogos(true);
  let existing: { data: { id: string; example_skus?: string[]; usage_count?: number } | null } = { data: null };
  if (supplierId) {
    const q = supabase.from("sku_pattern_memory").select("id, example_skus, usage_count").eq("base_sku_pattern", base).eq("supplier_id", supplierId);
    if (brandId) q.eq("brand_id", brandId);
    else q.is("brand_id", null);
    const r = await q.maybeSingle();
    existing = { data: r.data as { id: string; example_skus?: string[]; usage_count?: number } | null };
  } else if (brandId) {
    const r = await supabase.from("sku_pattern_memory").select("id, example_skus, usage_count").eq("base_sku_pattern", base).eq("brand_id", brandId).is("supplier_id", null).maybeSingle();
    existing = { data: r.data as { id: string; example_skus?: string[]; usage_count?: number } | null };
  }

  const prev = existing.data;
  const examples: string[] = Array.isArray(prev?.example_skus) ? prev.example_skus : [];
  if (exampleSku && !examples.includes(exampleSku)) examples.push(exampleSku);
  const payload = {
    supplier_id: supplierId ?? null,
    brand_id: brandId ?? null,
    base_sku_pattern: base,
    suffix_type: suffixType,
    suffix_values: suffixValues,
    example_skus: examples.slice(-20),
    usage_count: prev?.usage_count ?? 0,
    updated_at: new Date().toISOString(),
  };

  if (prev?.id) {
    await supabase.from("sku_pattern_memory").update(payload).eq("id", prev.id);
    return { id: prev.id };
  }
  const { data: inserted, error } = await supabase
    .from("sku_pattern_memory")
    .insert({
      ...payload,
      usage_count: 1,
    })
    .select("id")
    .single();
  if (error || !inserted) return null;
  return { id: (inserted as { id: string }).id };
}

/**
 * Increment usage_count for a pattern (e.g. when resolution used it).
 */
export async function incrementPatternUsage(patternId: string): Promise<void> {
  const supabase = getSupabaseCatalogos(true);
  const { data } = await supabase.from("sku_pattern_memory").select("usage_count").eq("id", patternId).single();
  const count = (data as { usage_count?: number } | undefined)?.usage_count ?? 0;
  await supabase.from("sku_pattern_memory").update({ usage_count: count + 1, updated_at: new Date().toISOString() }).eq("id", patternId);
}
