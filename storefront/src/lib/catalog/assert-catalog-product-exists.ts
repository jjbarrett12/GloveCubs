/**
 * Validates catalog_v2 product id for operator assignment (read-only; no matcher).
 */

export async function assertActiveCatalogProductExists(supabase: any, catalogProductId: string): Promise<boolean> {
  const { data, error } = await supabase
    .schema("catalog_v2")
    .from("catalog_products")
    .select("id")
    .eq("id", catalogProductId)
    .eq("status", "active")
    .maybeSingle();
  if (error) return false;
  return Boolean(data?.id);
}
