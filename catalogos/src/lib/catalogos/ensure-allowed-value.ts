/**
 * Ensure an attribute value exists in attribute_allowed_values for the category.
 * If the value is not in the allowed list, insert it so storefront filters can show it.
 * (e.g. 12mil glove → add "12" to thickness_mil allowed values for disposable_gloves)
 */

import { getSupabaseCatalogos } from "@/lib/db/client";

export interface EnsureAllowedValueInput {
  categorySlug: string;
  attributeKey: string;
  valueText: string;
  valueNumber?: number | null;
}

/**
 * Resolve category_id and attribute_definition_id, then insert allowed value if not present.
 * Uses ON CONFLICT DO NOTHING for idempotency.
 */
export async function ensureAllowedValue(input: EnsureAllowedValueInput): Promise<{ added: boolean }> {
  const supabase = getSupabaseCatalogos(true);

  const { data: cat } = await supabase.from("categories").select("id").eq("slug", input.categorySlug).single();
  if (!cat?.id) return { added: false };

  const { data: attr } = await supabase
    .from("attribute_definitions")
    .select("id")
    .eq("category_id", cat.id)
    .eq("attribute_key", input.attributeKey)
    .single();
  if (!attr?.id) return { added: false };

  if (!input.valueText && input.valueNumber == null) return { added: false };

  const { error } = await supabase.from("attribute_allowed_values").insert({
    attribute_definition_id: attr.id,
    value_text: input.valueText || null,
    value_number: input.valueNumber ?? null,
    sort_order: 9999,
  });

  if (error) {
    if (error.code === "23505") return { added: false };
    throw new Error(error.message);
  }
  return { added: true };
}

/**
 * After extracting filter attributes, ensure any value not in the predefined list
 * is added to allowed_values for that category/attribute (e.g. thickness_mil "12").
 */
export async function ensureExtractedValuesInAllowed(
  categorySlug: string,
  filterAttributes: Record<string, unknown>
): Promise<void> {
  const keysToCheck = [
    "thickness_mil",
    "material",
    "size",
    "color",
    "powder",
    "grade",
    "texture",
    "cuff_style",
    "packaging",
    "sterility",
    "cut_level_ansi",
    "puncture_level",
    "abrasion_level",
    "flame_resistant",
    "arc_rating",
    "warm_cold_weather",
  ];
  for (const key of keysToCheck) {
    const v = filterAttributes[key];
    if (v == null) continue;
    if (Array.isArray(v)) continue;
    const valueText = typeof v === "number" ? String(v) : String(v).trim().toLowerCase();
    if (!valueText) continue;
    await ensureAllowedValue({
      categorySlug,
      attributeKey: key,
      valueText,
      valueNumber: typeof v === "number" ? v : null,
    });
  }
}
