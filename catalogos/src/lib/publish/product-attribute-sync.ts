/**
 * Sync product_attributes from staged filter_attributes.
 * Single-select: one row per (product_id, attribute_definition_id); delete existing then insert one.
 * Multi-select: one row per (product_id, attribute_definition_id, value_text); delete existing then insert one per value.
 * Prevents duplicates and removes stale values.
 */

import { getSupabaseCatalogos, isSupabaseConfigured } from "@/lib/db/client";
import { isMultiSelectAttribute, normalizeFilterAttributesKeys } from "@/lib/catalogos/attribute-validation";

/** Keys stored on catalog_variants (not catalogos.product_attributes). */
const EXCLUDED_FROM_PRODUCT_ATTRIBUTE_SYNC = new Set(["category", "size"]);

/**
 * Resolve attribute_definition ids for an attribute_key across all categories (for storefront filtering).
 */
export async function getAttributeDefinitionIdsByKey(attributeKey: string): Promise<string[]> {
  const supabase = getSupabaseCatalogos(true);
  const { data: rows, error } = await supabase
    .from("attribute_definitions")
    .select("id")
    .eq("attribute_key", attributeKey)
    .limit(500);
  if (error) return [];
  return (rows ?? []).map((r: { id: string }) => r.id);
}

/**
 * Resolve attribute_definition ids for multiple keys in one query (bounded, for getFilteredProductIds).
 */
export async function getAttributeDefinitionIdsByKeys(attributeKeys: string[]): Promise<Map<string, string[]>> {
  if (attributeKeys.length === 0) return new Map();
  const supabase = getSupabaseCatalogos(true);
  const { data: rows, error } = await supabase
    .from("attribute_definitions")
    .select("id, attribute_key")
    .in("attribute_key", attributeKeys)
    .limit(2000);
  if (error) return new Map();
  const map = new Map<string, string[]>();
  for (const r of rows ?? []) {
    const row = r as { id: string; attribute_key: string };
    const arr = map.get(row.attribute_key) ?? [];
    arr.push(row.id);
    map.set(row.attribute_key, arr);
  }
  return map;
}

/**
 * Resolve attribute_definition_id for (category_id, attribute_key).
 */
export async function getAttributeDefinitionIds(
  categoryId: string,
  attributeKeys: string[]
): Promise<Map<string, string>> {
  if (attributeKeys.length === 0) return new Map();
  const supabase = getSupabaseCatalogos(true);
  const { data: rows, error } = await supabase
    .from("attribute_definitions")
    .select("id, attribute_key")
    .eq("category_id", categoryId)
    .in("attribute_key", attributeKeys);
  if (error) throw new Error(`attribute_definitions lookup: ${error.message}`);
  const map = new Map<string, string>();
  for (const r of rows ?? []) {
    const row = r as { id: string; attribute_key: string };
    map.set(row.attribute_key, row.id);
  }
  return map;
}

/**
 * Persist filter attributes to product_attributes.
 * Single-select: delete all rows for (product_id, attribute_definition_id), insert one row.
 * Multi-select: delete all rows for (product_id, attribute_definition_id), insert one row per value (no duplicates, no stale).
 */
async function purgeSizeProductAttributeRows(productId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const defIds = await getAttributeDefinitionIdsByKey("size");
  if (defIds.length === 0) return;
  const supabase = getSupabaseCatalogos(true);
  const { error } = await supabase
    .from("product_attributes")
    .delete()
    .eq("product_id", productId)
    .in("attribute_definition_id", defIds);
  if (error) throw new Error(`product_attributes purge size: ${error.message}`);
}

export async function syncProductAttributesFromStaged(
  productId: string,
  categoryId: string,
  filterAttributes: Record<string, unknown>
): Promise<{ synced: number; errors: string[] }> {
  await purgeSizeProductAttributeRows(productId);
  const canonicalFilterAttributes = normalizeFilterAttributesKeys({ ...filterAttributes });
  const keys = Object.keys(canonicalFilterAttributes).filter(
    (k) =>
      !EXCLUDED_FROM_PRODUCT_ATTRIBUTE_SYNC.has(k) &&
      canonicalFilterAttributes[k] !== undefined &&
      canonicalFilterAttributes[k] !== null &&
      canonicalFilterAttributes[k] !== ""
  );
  if (keys.length === 0) return { synced: 0, errors: [] };

  const attrDefIds = await getAttributeDefinitionIds(categoryId, keys);
  const supabase = getSupabaseCatalogos(true);
  const errors: string[] = [];
  let synced = 0;

  for (const key of keys) {
    const attrDefId = attrDefIds.get(key);
    if (!attrDefId) {
      errors.push(`No attribute_definition for category + ${key}`);
      continue;
    }
    const raw = canonicalFilterAttributes[key];
    const isMulti = isMultiSelectAttribute(key);

    if (isMulti) {
      const values = Array.isArray(raw)
        ? (raw as string[]).map((v) => String(v).trim()).filter(Boolean)
        : typeof raw === "string"
          ? raw.split(",").map((s) => s.trim()).filter(Boolean)
          : [];
      const uniqueValues = [...new Set(values)];
      const { error: delErr } = await supabase
        .from("product_attributes")
        .delete()
        .eq("product_id", productId)
        .eq("attribute_definition_id", attrDefId);
      if (delErr) {
        errors.push(`${key}: delete ${delErr.message}`);
        continue;
      }
      if (uniqueValues.length === 0) {
        synced++;
        continue;
      }
      const rows = uniqueValues.map((value_text) => ({
        product_id: productId,
        attribute_definition_id: attrDefId,
        value_text,
        value_number: null,
        value_boolean: null,
      }));
      const { error: insErr } = await supabase.from("product_attributes").insert(rows);
      if (insErr) {
        errors.push(`${key}: insert ${insErr.message}`);
        continue;
      }
      synced++;
    } else {
      let value_text: string | null = null;
      let value_number: number | null = null;
      let value_boolean: boolean | null = null;
      if (typeof raw === "number") {
        value_number = raw;
      } else if (typeof raw === "boolean") {
        value_boolean = raw;
      } else if (typeof raw === "string") {
        value_text = raw.trim() || null;
      } else if (Array.isArray(raw) && (raw as string[]).length > 0) {
        value_text = (raw as string[]).map((v) => String(v).trim()).filter(Boolean)[0] ?? null;
      }
      if (value_text === null && value_number === null && value_boolean === null) continue;
      const { error: delErr } = await supabase
        .from("product_attributes")
        .delete()
        .eq("product_id", productId)
        .eq("attribute_definition_id", attrDefId);
      if (delErr) {
        errors.push(`${key}: delete ${delErr.message}`);
        continue;
      }
      const { error: insErr } = await supabase.from("product_attributes").insert({
        product_id: productId,
        attribute_definition_id: attrDefId,
        value_text,
        value_number,
        value_boolean,
      });
      if (insErr) {
        errors.push(`${key}: insert ${insErr.message}`);
        continue;
      }
      synced++;
    }
  }
  return { synced, errors };
}
