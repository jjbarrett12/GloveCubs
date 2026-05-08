/** Read-only check against catalogos.suppliers (no duplicate supplier master). */

export async function assertActiveCatalogosSupplierExists(supabase: any, supplierId: string): Promise<boolean> {
  const { data, error } = await supabase
    .schema("catalogos")
    .from("suppliers")
    .select("id")
    .eq("id", supplierId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) return false;
  return Boolean(data?.id);
}
