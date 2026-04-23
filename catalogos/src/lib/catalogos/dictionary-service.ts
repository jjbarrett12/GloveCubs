/**
 * Attribute dictionary service: single source of truth from DB.
 * Loads attribute_definitions, attribute_allowed_values, category_attribute_requirements.
 * Synonym normalization is delegated to the synonym provider (DB-backed with TTL cache and explicit fallback).
 */

import { getSupabaseCatalogos } from "@/lib/db/client";
import { getDefaultSynonymProvider, type SynonymMap } from "./synonym-provider";

export type RequirementLevel = "required" | "strongly_preferred";

export interface AttributeDefinitionRow {
  id: string;
  category_id: string;
  attribute_key: string;
  label: string;
  display_group: string | null;
  sort_order: number;
  cardinality: "single" | "multi";
  is_required: boolean;
  is_filterable: boolean;
}

export interface CategoryRequirementRow {
  attribute_key: string;
  attribute_definition_id: string;
  requirement_level: RequirementLevel;
}

export interface FacetDefinition {
  attribute_key: string;
  label: string;
  display_group: string | null;
  sort_order: number;
  cardinality: "single" | "multi";
  allowed_values: { value_text: string; sort_order: number }[];
}

/** Allowed values by attribute_key: attribute_key -> value_text[] (ordered by sort_order) */
export type AllowedValuesMap = Record<string, string[]>;

const CACHE_TTL_MS = 60_000; // 1 minute
let cache: {
  allowedByKey: AllowedValuesMap | null;
  requirementsByCategory: Map<string, CategoryRequirementRow[]> | null;
  facetDefsByCategory: Map<string, FacetDefinition[]> | null;
  loadedAt: number;
} = {
  allowedByKey: null,
  requirementsByCategory: null,
  facetDefsByCategory: null,
  loadedAt: 0,
};

function isCacheValid(): boolean {
  return cache.loadedAt > 0 && Date.now() - cache.loadedAt < CACHE_TTL_MS;
}

/**
 * Load synonym map from the synonym provider (DB-backed, TTL cache, explicit fallback when DB empty/fails).
 * Use this in the normalization pipeline so a single source of truth is used.
 */
export async function loadSynonymMap(): Promise<SynonymMap> {
  return getDefaultSynonymProvider().getMap();
}

/**
 * Load allowed values for all attributes: attribute_key -> value_text[] (by sort_order).
 */
export async function loadAllowedValuesMap(): Promise<AllowedValuesMap> {
  if (cache.allowedByKey != null && isCacheValid()) return cache.allowedByKey;
  const supabase = getSupabaseCatalogos(true);
  const { data: rows, error } = await supabase
    .from("attribute_allowed_values")
    .select("value_text, sort_order, attribute_definition_id")
    .order("sort_order", { ascending: true });
  if (error || !rows?.length) {
    cache.loadedAt = Date.now();
    return {};
  }
  const defIds = [...new Set((rows as { attribute_definition_id: string }[]).map((r) => r.attribute_definition_id))];
  const { data: defRows } = await supabase.from("attribute_definitions").select("id, attribute_key").in("id", defIds);
  const idToKey = new Map<string, string>();
  for (const d of defRows ?? []) {
    const row = d as { id: string; attribute_key: string };
    idToKey.set(row.id, row.attribute_key);
  }
  const map: AllowedValuesMap = {};
  for (const r of rows as { value_text: string; sort_order: number; attribute_definition_id: string }[]) {
    const key = idToKey.get(r.attribute_definition_id);
    if (!key) continue;
    if (!map[key]) map[key] = [];
    map[key].push(r.value_text);
  }
  cache.allowedByKey = map;
  cache.loadedAt = Date.now();
  return map;
}

/** Re-export for callers that need the provider directly. */
export { getDefaultSynonymProvider } from "./synonym-provider";

/**
 * Load category_attribute_requirements for a category (or all).
 * Returns attribute_key + requirement_level per category.
 */
export async function loadRequirementsForCategory(categoryId: string): Promise<CategoryRequirementRow[]> {
  if (cache.requirementsByCategory?.has(categoryId) && isCacheValid()) {
    return cache.requirementsByCategory.get(categoryId) ?? [];
  }
  const supabase = getSupabaseCatalogos(true);
  const { data: rows, error } = await supabase
    .from("category_attribute_requirements")
    .select("requirement_level, attribute_definition_id")
    .eq("category_id", categoryId);
  if (error || !rows?.length) return [];
  const defIds = (rows as { attribute_definition_id: string }[]).map((r) => r.attribute_definition_id);
  const { data: defRows } = await supabase.from("attribute_definitions").select("id, attribute_key").in("id", defIds);
  const idToKey = new Map((defRows ?? []).map((d: { id: string; attribute_key: string }) => [d.id, d.attribute_key]));
  const list: CategoryRequirementRow[] = (rows as { requirement_level: string; attribute_definition_id: string }[]).map((r) => ({
    attribute_key: idToKey.get(r.attribute_definition_id) ?? "",
    attribute_definition_id: r.attribute_definition_id,
    requirement_level: r.requirement_level as RequirementLevel,
  })).filter((r) => r.attribute_key);
  if (!cache.requirementsByCategory) cache.requirementsByCategory = new Map();
  cache.requirementsByCategory.set(categoryId, list);
  cache.loadedAt = Date.now();
  return list;
}

/**
 * Load attribute definitions with allowed values for a category (for facets and review UI).
 * Ordered by sort_order; includes display_group for filter rendering.
 */
export async function loadFacetDefinitionsForCategory(categoryId: string): Promise<FacetDefinition[]> {
  if (cache.facetDefsByCategory?.has(categoryId) && isCacheValid()) {
    return cache.facetDefsByCategory.get(categoryId) ?? [];
  }
  const supabase = getSupabaseCatalogos(true);
  const { data: defs, error: defsErr } = await supabase
    .from("attribute_definitions")
    .select("id, attribute_key, label, display_group, sort_order, cardinality")
    .eq("category_id", categoryId)
    .eq("is_filterable", true)
    .order("sort_order", { ascending: true });
  if (defsErr || !defs?.length) return [];
  const defIds = (defs as { id: string }[]).map((d) => d.id);
  const { data: allowedRows } = await supabase
    .from("attribute_allowed_values")
    .select("attribute_definition_id, value_text, sort_order")
    .in("attribute_definition_id", defIds)
    .order("sort_order", { ascending: true });
  const allowedByDefId = new Map<string, { value_text: string; sort_order: number }[]>();
  for (const r of allowedRows ?? []) {
    const row = r as { attribute_definition_id: string; value_text: string; sort_order: number };
    if (!allowedByDefId.has(row.attribute_definition_id)) allowedByDefId.set(row.attribute_definition_id, []);
    allowedByDefId.get(row.attribute_definition_id)!.push({ value_text: row.value_text, sort_order: row.sort_order });
  }
  const result: FacetDefinition[] = (defs as AttributeDefinitionRow[]).map((d) => ({
    attribute_key: d.attribute_key,
    label: d.label,
    display_group: d.display_group,
    sort_order: d.sort_order,
    cardinality: (d.cardinality as "single" | "multi") ?? "single",
    allowed_values: allowedByDefId.get(d.id) ?? [],
  }));
  if (!cache.facetDefsByCategory) cache.facetDefsByCategory = new Map();
  cache.facetDefsByCategory.set(categoryId, result);
  cache.loadedAt = Date.now();
  return result;
}

/**
 * Resolve category_id from category slug (e.g. disposable_gloves).
 */
export async function getCategoryIdBySlug(slug: string): Promise<string | null> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase.from("categories").select("id").eq("slug", slug).maybeSingle();
  if (error || !data) return null;
  return (data as { id: string }).id;
}

/**
 * Invalidate cache (e.g. after admin updates dictionary).
 * Also invalidates the synonym provider cache so next loadSynonymMap() refetches from DB.
 */
export function invalidateDictionaryCache(): void {
  getDefaultSynonymProvider().invalidate();
  cache = {
    allowedByKey: null,
    requirementsByCategory: null,
    facetDefsByCategory: null,
    loadedAt: 0,
  };
}

/** Payload for review UI: required / strongly preferred keys and allowed values per attribute. */
export interface ReviewDictionaryPayload {
  required: string[];
  stronglyPreferred: string[];
  allowedByKey: Record<string, string[]>;
  facetDefinitions: FacetDefinition[];
}

/**
 * Load requirement levels and allowed values for a category (review UI and attribute edit validation).
 */
export async function getReviewDictionaryForCategory(categoryId: string): Promise<ReviewDictionaryPayload> {
  const [requirements, allowedMap, facetDefs] = await Promise.all([
    loadRequirementsForCategory(categoryId),
    loadAllowedValuesMap(),
    loadFacetDefinitionsForCategory(categoryId),
  ]);
  const required: string[] = [];
  const stronglyPreferred: string[] = [];
  for (const r of requirements) {
    if (r.requirement_level === "required") required.push(r.attribute_key);
    else stronglyPreferred.push(r.attribute_key);
  }
  return {
    required,
    stronglyPreferred,
    allowedByKey: allowedMap,
    facetDefinitions: facetDefs,
  };
}
