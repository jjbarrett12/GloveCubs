/**
 * Read helpers for trusted spend memory (Phase 4) — no UI, query foundation only.
 */

export async function fetchLatestTrustedPriceObservation(
  supabase: any,
  companyId: string,
  catalogProductId: string
): Promise<{ unit_price: number; quantity: number; observed_at: string; catalogos_supplier_id: string } | null> {
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("price_observations")
    .select("unit_price, quantity, observed_at, catalogos_supplier_id")
    .eq("company_id", companyId)
    .eq("catalog_product_id", catalogProductId)
    .eq("trust_status", "trusted")
    .order("observed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as Record<string, unknown>;
  return {
    unit_price: Number(r.unit_price),
    quantity: Number(r.quantity),
    observed_at: String(r.observed_at),
    catalogos_supplier_id: String(r.catalogos_supplier_id),
  };
}

export async function fetchTrustedObservationHistory(
  supabase: any,
  companyId: string,
  catalogProductId: string,
  limit = 100
): Promise<unknown[]> {
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("price_observations")
    .select(
      "id, invoice_line_id, uploaded_invoice_id, catalogos_supplier_id, quantity, unit_price, line_total, observed_at, trust_status, exclusion_reason, created_at"
    )
    .eq("company_id", companyId)
    .eq("catalog_product_id", catalogProductId)
    .in("trust_status", ["trusted", "superseded"])
    .order("observed_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return data ?? [];
}

export async function fetchSupplierTrustedPriceHistory(
  supabase: any,
  companyId: string,
  catalogosSupplierId: string,
  catalogProductId: string,
  limit = 100
): Promise<unknown[]> {
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("price_observations")
    .select(
      "id, invoice_line_id, uploaded_invoice_id, quantity, unit_price, line_total, observed_at, trust_status, created_at"
    )
    .eq("company_id", companyId)
    .eq("catalogos_supplier_id", catalogosSupplierId)
    .eq("catalog_product_id", catalogProductId)
    .eq("trust_status", "trusted")
    .order("observed_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return data ?? [];
}
