/**
 * Sync storefront filter truth to catalogos.product_attributes.
 * Ported from catalogos publish pattern; storefront admin editor path.
 *
 * @see product-attribute-upsert.ts — legacy 4-key promote-only path; editor uses this module.
 */

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { GLOBAL_MULTI_SELECT_ATTRIBUTE_KEYS } from "@/lib/catalog/catalog-facet-registry";
import { normalizeToAllowedValue } from "@/lib/admin/product-attribute-upsert";
import { mapImportDraftToAttributes } from "@/lib/admin/import-suggestion-mapper";
import type { ImportDraftProductV1 } from "@/lib/admin/import-draft-types";

const EXCLUDED_KEYS = new Set(["brand", "category", "size"]);

export type AttributeDefinitionRow = {
  id: string;
  attributeKey: string;
  label: string;
  displayGroup: string | null;
  cardinality: string;
  isRequired: boolean;
  isFilterable: boolean;
  allowedValues: string[];
};

function isMultiSelectKey(key: string): boolean {
  return (GLOBAL_MULTI_SELECT_ATTRIBUTE_KEYS as readonly string[]).includes(key);
}

export async function fetchCategoryAttributeDefinitions(
  categoryId: string
): Promise<AttributeDefinitionRow[]> {
  if (!isSupabaseConfigured() || !categoryId.trim()) return [];
  const supabase = getSupabaseAdmin() as any;

  const { data: defs, error } = await supabase
    .schema("catalogos")
    .from("attribute_definitions")
    .select("id, attribute_key, label, display_group, cardinality, is_required, is_filterable")
    .eq("category_id", categoryId.trim())
    .eq("is_filterable", true)
    .order("sort_order", { ascending: true });

  if (error || !defs?.length) return [];

  const rows = defs as Array<{
    id: string;
    attribute_key: string;
    label: string;
    display_group: string | null;
    cardinality: string;
    is_required: boolean;
    is_filterable: boolean;
  }>;

  const idList = rows.map((r) => r.id);
  const { data: allowedRows } = await supabase
    .schema("catalogos")
    .from("attribute_allowed_values")
    .select("attribute_definition_id, value_text, sort_order")
    .in("attribute_definition_id", idList)
    .order("sort_order", { ascending: true });

  const allowedByDefId = new Map<string, string[]>();
  for (const row of (allowedRows ?? []) as { attribute_definition_id: string; value_text: string }[]) {
    const arr = allowedByDefId.get(row.attribute_definition_id) ?? [];
    arr.push(row.value_text);
    allowedByDefId.set(row.attribute_definition_id, arr);
  }

  return rows
    .filter((r) => !EXCLUDED_KEYS.has(r.attribute_key))
    .map((r) => ({
      id: r.id,
      attributeKey: r.attribute_key,
      label: r.label,
      displayGroup: r.display_group,
      cardinality: r.cardinality,
      isRequired: r.is_required,
      isFilterable: r.is_filterable,
      allowedValues: allowedByDefId.get(r.id) ?? [],
    }));
}

export function productAttributesFromRows(
  rows: Array<{ attributeDefinitionId: string; valueText: string | null }>,
  keyByDefId: Map<string, string>
): Record<string, string | string[]> {
  const out: Record<string, string[]> = {};
  for (const r of rows) {
    const key = keyByDefId.get(r.attributeDefinitionId);
    const vt = r.valueText?.trim();
    if (!key || !vt) continue;
    const arr = out[key] ?? [];
    if (!arr.includes(vt)) arr.push(vt);
    out[key] = arr;
  }
  const normalized: Record<string, string | string[]> = {};
  for (const [k, vals] of Object.entries(out)) {
    normalized[k] = isMultiSelectKey(k) ? vals : vals[0] ?? "";
  }
  return normalized;
}

export function validateEditorAttributes(
  attributes: Record<string, string | string[]>,
  definitions: AttributeDefinitionRow[]
): { ok: true } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const defByKey = new Map(definitions.map((d) => [d.attributeKey, d]));

  for (const [key, raw] of Object.entries(attributes)) {
    const def = defByKey.get(key);
    if (!def) continue;
    const allowed = def.allowedValues;
    if (allowed.length === 0) continue;

    const values = isMultiSelectKey(key)
      ? Array.isArray(raw)
        ? raw
        : raw
          ? [String(raw)]
          : []
      : [Array.isArray(raw) ? raw[0] : raw].filter(Boolean).map(String);

    for (const v of values) {
      const norm = normalizeToAllowedValue(v, allowed);
      if (!norm) errors[key] = `"${v}" is not an allowed value`;
    }
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true };
}

/** Keep only attribute keys defined for the target category. */
export function filterAttributesToCategory(
  attributes: Record<string, string | string[]>,
  definitions: AttributeDefinitionRow[]
): Record<string, string | string[]> {
  const validKeys = new Set(definitions.map((d) => d.attributeKey));
  const out: Record<string, string | string[]> = {};
  for (const [key, val] of Object.entries(attributes)) {
    if (validKeys.has(key)) out[key] = val;
  }
  return out;
}

/** Remove PA rows whose definition ids are not in the current category. */
export async function purgeOrphanProductAttributesForCategory(
  productId: string,
  definitions: AttributeDefinitionRow[]
): Promise<{ error?: string }> {
  if (!isSupabaseConfigured()) return {};
  const supabase = getSupabaseAdmin() as any;
  const validIds = definitions.map((d) => d.id);
  let query = supabase.schema("catalogos").from("product_attributes").delete().eq("product_id", productId);
  if (validIds.length > 0) {
    query = query.not("attribute_definition_id", "in", `(${validIds.join(",")})`);
  }
  const { error } = await query;
  return error ? { error: error.message } : {};
}

export async function syncProductAttributesFromEditor(
  productId: string,
  categoryId: string,
  attributes: Record<string, string | string[]>,
  definitions: AttributeDefinitionRow[]
): Promise<{ synced: number; errors: string[] }> {
  if (!isSupabaseConfigured() || !categoryId.trim()) {
    return { synced: 0, errors: ["Supabase not configured or missing category"] };
  }

  const validation = validateEditorAttributes(attributes, definitions);
  if (!validation.ok) {
    return { synced: 0, errors: Object.entries(validation.errors).map(([k, v]) => `${k}: ${v}`) };
  }

  const purge = await purgeOrphanProductAttributesForCategory(productId, definitions);
  if (purge.error) {
    return { synced: 0, errors: [`purge: ${purge.error}`] };
  }

  const supabase = getSupabaseAdmin() as any;
  const defByKey = new Map(definitions.map((d) => [d.attributeKey, d]));
  const errors: string[] = [];
  let synced = 0;

  for (const def of definitions) {
    const key = def.attributeKey;
    const raw = attributes[key];
    const attrDefId = def.id;

    const { error: delErr } = await supabase
      .schema("catalogos")
      .from("product_attributes")
      .delete()
      .eq("product_id", productId)
      .eq("attribute_definition_id", attrDefId);
    if (delErr) {
      errors.push(`${key}: delete ${delErr.message}`);
      continue;
    }

    if (raw === undefined || raw === null || raw === "" || (Array.isArray(raw) && raw.length === 0)) {
      synced++;
      continue;
    }

    if (isMultiSelectKey(key)) {
      const values = (Array.isArray(raw) ? raw : [String(raw)])
        .map((v) => normalizeToAllowedValue(v, def.allowedValues))
        .filter((v): v is string => Boolean(v));
      const unique = Array.from(new Set(values));
      if (unique.length === 0) {
        synced++;
        continue;
      }
      const rows = unique.map((value_text) => ({
        product_id: productId,
        attribute_definition_id: attrDefId,
        value_text,
        value_number: null,
        value_boolean: null,
      }));
      const { error: insErr } = await supabase.schema("catalogos").from("product_attributes").insert(rows);
      if (insErr) errors.push(`${key}: insert ${insErr.message}`);
      else synced++;
    } else {
      const rawVal = Array.isArray(raw) ? raw[0] : raw;
      const value_text = normalizeToAllowedValue(String(rawVal), def.allowedValues);
      if (!value_text) {
        errors.push(`${key}: value not in allowed dictionary`);
        continue;
      }
      const { error: insErr } = await supabase.schema("catalogos").from("product_attributes").insert({
        product_id: productId,
        attribute_definition_id: attrDefId,
        value_text,
        value_number: null,
        value_boolean: null,
      });
      if (insErr) errors.push(`${key}: insert ${insErr.message}`);
      else synced++;
    }
  }

  return { synced, errors };
}

export async function attributesFromImportDraft(
  categoryId: string,
  draft: ImportDraftProductV1
): Promise<Record<string, string | string[]>> {
  const defs = await fetchCategoryAttributeDefinitions(categoryId);
  const allowedByKey = new Map(defs.map((d) => [d.attributeKey, d.allowedValues]));
  return mapImportDraftToAttributes(draft, allowedByKey).attributes;
}
