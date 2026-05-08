/**
 * Conservative supplier resolution against catalogos.suppliers (name only, Phase 2).
 * No parallel supplier master — reads existing CatalogOS suppliers only.
 */

export type SupplierResolveOutcome = {
  catalogos_supplier_id: string | null;
  confidence: number | null;
  method: "exact_ilike" | "fuzzy_ilike" | "none";
  review_status: "pending_review" | "review_required" | "ambiguous" | "no_match";
  normalized_vendor_key: string;
};

function normalizeVendorKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

function escapeIlike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export async function resolveInvoiceVendor(supabase: any, vendorRaw: string | null | undefined): Promise<SupplierResolveOutcome> {
  const key = normalizeVendorKey(vendorRaw ?? "");
  if (!key) {
    return {
      catalogos_supplier_id: null,
      confidence: null,
      method: "none",
      review_status: "no_match",
      normalized_vendor_key: "",
    };
  }

  const { data: exactRows, error: exactErr } = await supabase
    .schema("catalogos")
    .from("suppliers")
    .select("id,name")
    .eq("is_active", true)
    .ilike("name", key)
    .limit(5);

  if (exactErr) {
    return {
      catalogos_supplier_id: null,
      confidence: null,
      method: "none",
      review_status: "no_match",
      normalized_vendor_key: key,
    };
  }

  const exact = exactRows ?? [];
  if (exact.length === 1) {
    return {
      catalogos_supplier_id: String((exact[0] as { id: string }).id),
      confidence: 0.98,
      method: "exact_ilike",
      review_status: "pending_review",
      normalized_vendor_key: key,
    };
  }
  if (exact.length > 1) {
    return {
      catalogos_supplier_id: null,
      confidence: null,
      method: "none",
      review_status: "ambiguous",
      normalized_vendor_key: key,
    };
  }

  const like = `%${escapeIlike(key)}%`;
  const { data: fuzzyRows, error: fuzzyErr } = await supabase
    .schema("catalogos")
    .from("suppliers")
    .select("id,name")
    .eq("is_active", true)
    .ilike("name", like)
    .limit(10);

  if (fuzzyErr || !fuzzyRows?.length) {
    return {
      catalogos_supplier_id: null,
      confidence: null,
      method: "none",
      review_status: "no_match",
      normalized_vendor_key: key,
    };
  }

  if (fuzzyRows.length === 1) {
    return {
      catalogos_supplier_id: String((fuzzyRows[0] as { id: string }).id),
      confidence: 0.72,
      method: "fuzzy_ilike",
      review_status: "review_required",
      normalized_vendor_key: key,
    };
  }

  return {
    catalogos_supplier_id: null,
    confidence: null,
    method: "none",
    review_status: "ambiguous",
    normalized_vendor_key: key,
  };
}
