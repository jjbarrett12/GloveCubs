/**
 * Attribute definition id resolution — mirror of `catalogos/src/lib/publish/product-attribute-sync.ts` (subset).
 */

export async function getAttributeDefinitionIdsByKey(supabase: any, attributeKey: string): Promise<string[]> {
  const { data: rows, error } = await supabase
    .schema("catalogos")
    .from("attribute_definitions")
    .select("id")
    .eq("attribute_key", attributeKey)
    .limit(500);
  if (error) return [];
  return (rows ?? []).map((r: { id: string }) => r.id);
}

export async function getAttributeDefinitionIdsByKeys(supabase: any, attributeKeys: string[]): Promise<Map<string, string[]>> {
  if (attributeKeys.length === 0) return new Map();
  const { data: rows, error } = await supabase
    .schema("catalogos")
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
