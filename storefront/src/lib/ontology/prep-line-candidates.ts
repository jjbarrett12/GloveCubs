/**
 * Catalog-bound candidate set for restaurant_prep_line.
 * Evidence: governed allowed values on certifications (food_safe) OR uses (food_handling)
 * per disposable attribute seed — no AI inference of fit.
 */

import { getAttributeDefinitionIdsByKeys } from "@/lib/catalog/store-attribute-defs";
import { RESTAURANT_PREP_LINE_SEMANTICS } from "@/lib/ontology/operational-environments";

const MAX_IDS = 80;
const MAX_ATTR_ROWS = 50_000;

async function productIdsForAttributeValues(
  supabase: any,
  definitionIds: string[],
  values: readonly string[]
): Promise<Set<string>> {
  if (definitionIds.length === 0 || values.length === 0) return new Set();
  const { data } = await supabase
    .schema("catalogos")
    .from("product_attributes")
    .select("product_id")
    .in("attribute_definition_id", [...definitionIds])
    .in("value_text", [...values])
    .limit(MAX_ATTR_ROWS);
  return new Set(
    ((data ?? []) as { product_id: string }[]).map((r) => r.product_id).filter(Boolean)
  );
}

/**
 * Returns active catalog_v2 product ids that satisfy prep-line governed evidence (union).
 */
export async function fetchRestaurantPrepLineCandidateProductIds(supabase: any): Promise<string[]> {
  const keys = ["certifications", "uses"] as const;
  const defMap = await getAttributeDefinitionIdsByKeys(supabase, [...keys]);

  const certDefs = defMap.get("certifications") ?? [];
  const useDefs = defMap.get("uses") ?? [];

  const [foodSafe, foodHandling] = await Promise.all([
    productIdsForAttributeValues(
      supabase,
      certDefs,
      RESTAURANT_PREP_LINE_SEMANTICS.evidence.certifications_any_of
    ),
    productIdsForAttributeValues(
      supabase,
      useDefs,
      RESTAURANT_PREP_LINE_SEMANTICS.evidence.uses_any_of
    ),
  ]);

  const union = new Set<string>();
  foodSafe.forEach((id) => union.add(id));
  foodHandling.forEach((id) => union.add(id));
  if (union.size === 0) return [];

  const ids = Array.from(union);
  const slice = ids.length > MAX_IDS ? ids.slice(0, MAX_IDS) : ids;

  const { data: active } = await supabase
    .schema("catalog_v2")
    .from("catalog_products")
    .select("id")
    .in("id", slice)
    .eq("status", "active")
    .limit(MAX_IDS);

  return ((active ?? []) as { id: string }[]).map((r) => r.id).filter(Boolean);
}
