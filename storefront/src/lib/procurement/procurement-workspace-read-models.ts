/**
 * Phase 6 — operational read models (internal workspace only). Stable shapes + pagination limits.
 */

const DEFAULT_LIMIT = 80;

export async function fetchCompaniesWithRecommendations(
  supabase: any,
  limit = 40
): Promise<{ company_id: string; company_name: string | null; open_count: number; blocked_count: number }[]> {
  const s = supabase.schema("gc_commerce");
  const { data: openRows, error: e1 } = await s
    .from("savings_opportunities")
    .select("company_id")
    .in("trust_status", ["draft", "operator_reviewed"])
    .limit(5000);
  if (e1) return [];
  const { data: blockedRows, error: e2 } = await s.from("savings_opportunities").select("company_id").eq("trust_status", "blocked").limit(5000);
  if (e2) return [];
  const { data: approvedRows, error: e3 } = await s
    .from("savings_opportunities")
    .select("company_id")
    .eq("trust_status", "approved_for_customer")
    .limit(5000);
  if (e3) return [];

  const openBy = new Map<string, number>();
  for (const r of openRows ?? []) {
    const id = String((r as { company_id: string }).company_id);
    openBy.set(id, (openBy.get(id) ?? 0) + 1);
  }
  const blockedBy = new Map<string, number>();
  for (const r of blockedRows ?? []) {
    const id = String((r as { company_id: string }).company_id);
    blockedBy.set(id, (blockedBy.get(id) ?? 0) + 1);
  }
  const approvedBy = new Map<string, number>();
  for (const r of approvedRows ?? []) {
    const id = String((r as { company_id: string }).company_id);
    approvedBy.set(id, (approvedBy.get(id) ?? 0) + 1);
  }
  const ids = new Set<string>();
  for (const k of Array.from(openBy.keys())) ids.add(k);
  for (const k of Array.from(blockedBy.keys())) ids.add(k);
  for (const k of Array.from(approvedBy.keys())) ids.add(k);
  const idList = Array.from(ids).slice(0, limit);
  if (idList.length === 0) return [];

  const { data: companies, error: ce } = await s.from("companies").select("id, name").in("id", idList);
  if (ce) return idList.map((company_id) => ({ company_id, company_name: null, open_count: openBy.get(company_id) ?? 0, blocked_count: blockedBy.get(company_id) ?? 0 }));

  const nameBy = new Map<string, string | null>(
    (companies ?? []).map((c: { id: string; name: string | null }) => [String(c.id), c.name ?? null])
  );
  return idList.map((company_id) => ({
    company_id,
    company_name: (nameBy.get(company_id) ?? null) as string | null,
    open_count: openBy.get(company_id) ?? 0,
    blocked_count: blockedBy.get(company_id) ?? 0,
  }));
}

/** Draft + operator_reviewed — internal review queue (excludes approved_for_customer). */
export async function fetchRecommendationReviewQueue(
  supabase: any,
  companyId: string,
  limit = DEFAULT_LIMIT
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("savings_opportunities")
    .select(
      "id, company_id, source_invoice_line_id, source_catalog_product_id, candidate_catalog_product_id, spec_group_id, substitution_candidate_id, basis_uom, source_unit_price_normalized, candidate_unit_price_normalized, estimated_delta_per_basis, trust_status, block_reason, reviewed_at, reviewed_by, created_at"
    )
    .eq("company_id", companyId)
    .in("trust_status", ["draft", "operator_reviewed"])
    .order("created_at", { ascending: false })
    .limit(limit);
  return error ? [] : ((data ?? []) as Record<string, unknown>[]);
}

/** Joins invoice → uploaded invoice to attach `procurement_opportunity_id` for event append (internal ops). */
export async function fetchRecommendationReviewQueueEnriched(
  supabase: any,
  companyId: string,
  limit = DEFAULT_LIMIT
): Promise<Record<string, unknown>[]> {
  const rows = await fetchRecommendationReviewQueue(supabase, companyId, limit);
  if (rows.length === 0) return [];
  const lineIds = Array.from(new Set(rows.map((r) => String(r.source_invoice_line_id))));
  const { data: lines, error: le } = await supabase
    .schema("gc_commerce")
    .from("invoice_lines")
    .select("id, uploaded_invoice_id")
    .in("id", lineIds);
  if (le || !lines?.length) {
    return rows.map((r) => ({ ...r, procurement_opportunity_id: null }));
  }
  const lineToUpload = new Map((lines as { id: string; uploaded_invoice_id: string }[]).map((l) => [l.id, l.uploaded_invoice_id]));
  const uploadIds = Array.from(new Set(Array.from(lineToUpload.values())));
  const { data: ups, error: ue } = await supabase
    .schema("gc_commerce")
    .from("uploaded_invoices")
    .select("id, procurement_opportunity_id")
    .in("id", uploadIds);
  if (ue || !ups?.length) {
    return rows.map((r) => ({ ...r, procurement_opportunity_id: null }));
  }
  const uploadToOpp = new Map(
    (ups as { id: string; procurement_opportunity_id: string | null }[]).map((u) => [u.id, u.procurement_opportunity_id])
  );
  return rows.map((r) => {
    const lid = String(r.source_invoice_line_id);
    const uid = lineToUpload.get(lid);
    const opp = uid ? uploadToOpp.get(uid) : null;
    return { ...r, procurement_opportunity_id: opp ?? null };
  });
}

export async function fetchApprovedRecommendations(
  supabase: any,
  companyId: string,
  limit = DEFAULT_LIMIT
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("savings_opportunities")
    .select(
      "id, company_id, source_invoice_line_id, source_catalog_product_id, candidate_catalog_product_id, basis_uom, source_unit_price_normalized, candidate_unit_price_normalized, estimated_delta_per_basis, trust_status, approved_for_customer_at, created_at"
    )
    .eq("company_id", companyId)
    .eq("trust_status", "approved_for_customer")
    .order("created_at", { ascending: false })
    .limit(limit);
  const base = (error ? [] : (data ?? [])) as Record<string, unknown>[];
  if (base.length === 0) return [];
  const lineIds = Array.from(new Set(base.map((r) => String(r.source_invoice_line_id))));
  const { data: lines } = await supabase
    .schema("gc_commerce")
    .from("invoice_lines")
    .select("id, uploaded_invoice_id")
    .in("id", lineIds);
  const lineList = (lines ?? []) as { id: string; uploaded_invoice_id: string }[];
  const lineToUpload = new Map(lineList.map((l) => [l.id, l.uploaded_invoice_id]));
  const uploadIds = Array.from(new Set(Array.from(lineToUpload.values())));
  const { data: ups } = await supabase
    .schema("gc_commerce")
    .from("uploaded_invoices")
    .select("id, procurement_opportunity_id")
    .in("id", uploadIds);
  const upList = (ups ?? []) as { id: string; procurement_opportunity_id: string | null }[];
  const uploadToOpp = new Map(upList.map((u) => [u.id, u.procurement_opportunity_id]));
  return base.map((r) => {
    const uid = lineToUpload.get(String(r.source_invoice_line_id));
    return { ...r, procurement_opportunity_id: uid ? uploadToOpp.get(uid) ?? null : null };
  });
}

export async function fetchBlockedRecommendations(
  supabase: any,
  companyId: string,
  limit = DEFAULT_LIMIT
): Promise<unknown[]> {
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("savings_opportunities")
    .select(
      "id, company_id, source_invoice_line_id, source_catalog_product_id, candidate_catalog_product_id, spec_group_id, substitution_candidate_id, basis_uom, trust_status, block_reason, created_at"
    )
    .eq("company_id", companyId)
    .eq("trust_status", "blocked")
    .order("created_at", { ascending: false })
    .limit(limit);
  return error ? [] : (data ?? []);
}

export async function fetchTrustedSpendHistory(
  supabase: any,
  companyId: string,
  limit = DEFAULT_LIMIT
): Promise<unknown[]> {
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("price_observations")
    .select(
      "id, invoice_line_id, uploaded_invoice_id, catalog_product_id, catalogos_supplier_id, quantity, unit_price, line_total, observed_at, trust_status, created_at"
    )
    .eq("company_id", companyId)
    .eq("trust_status", "trusted")
    .order("observed_at", { ascending: false })
    .limit(limit);
  return error ? [] : (data ?? []);
}

export async function fetchLatestTrustedPriceByProduct(
  supabase: any,
  companyId: string,
  catalogProductId: string
): Promise<{ unit_price: number; observed_at: string } | null> {
  const { fetchLatestTrustedPriceObservation } = await import("@/lib/procurement/price-observation-queries");
  const r = await fetchLatestTrustedPriceObservation(supabase, companyId, catalogProductId);
  if (!r) return null;
  return { unit_price: r.unit_price, observed_at: r.observed_at };
}

/** Aggregates recent trusted observations in memory (bounded scan; operational, not BI). */
export async function fetchSupplierObservationSummary(
  supabase: any,
  companyId: string,
  scanLimit = 2000
): Promise<{ catalogos_supplier_id: string; observation_count: number; last_observed_at: string | null }[]> {
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("price_observations")
    .select("catalogos_supplier_id, observed_at")
    .eq("company_id", companyId)
    .eq("trust_status", "trusted")
    .order("observed_at", { ascending: false })
    .limit(scanLimit);
  if (error || !data) return [];
  const m = new Map<string, { count: number; last: string | null }>();
  for (const row of data as { catalogos_supplier_id: string; observed_at: string }[]) {
    const sid = String(row.catalogos_supplier_id);
    const cur = m.get(sid) ?? { count: 0, last: null };
    cur.count += 1;
    if (!cur.last) cur.last = String(row.observed_at);
    m.set(sid, cur);
  }
  return Array.from(m.entries()).map(([catalogos_supplier_id, v]) => ({
    catalogos_supplier_id,
    observation_count: v.count,
    last_observed_at: v.last,
  }));
}

export async function fetchProcurementEventTimeline(
  supabase: any,
  procurementOpportunityId: string,
  limit = 100
): Promise<unknown[]> {
  const { data, error } = await supabase
    .from("procurement_events")
    .select("id, opportunity_id, event_type, schema_version, payload, created_at")
    .eq("opportunity_id", procurementOpportunityId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return error ? [] : (data ?? []);
}

export async function fetchReorderMemory(
  supabase: any,
  companyId: string,
  activeOnly = true,
  limit = DEFAULT_LIMIT
): Promise<unknown[]> {
  let q = supabase
    .schema("gc_commerce")
    .from("procurement_reorder_memory")
    .select(
      "id, company_id, catalog_product_id, promoted_at, promoted_by, decision_source, basis_uom, last_trusted_unit_basis, valid_to, notes, source_savings_opportunity_id, created_at"
    )
    .eq("company_id", companyId)
    .order("promoted_at", { ascending: false })
    .limit(limit);
  if (activeOnly) q = q.is("valid_to", null);
  const { data, error } = await q;
  return error ? [] : (data ?? []);
}

/** First non-null procurement spine id for this company (for reorder retire event anchor). */
export async function fetchAnyProcurementOpportunityIdForCompany(supabase: any, companyId: string): Promise<string | null> {
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("uploaded_invoices")
    .select("procurement_opportunity_id")
    .eq("company_id", companyId)
    .not("procurement_opportunity_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const v = (data as { procurement_opportunity_id: string | null }).procurement_opportunity_id;
  return v ? String(v) : null;
}

export async function fetchProcurementOpportunitySummary(
  supabase: any,
  opportunityId: string
): Promise<{
  id: string;
  company_name: string | null;
  lifecycle_stage: string;
  created_at: string;
  quote_request_id: string | null;
  sales_prospect_id: number | null;
} | null> {
  const { data, error } = await supabase
    .from("procurement_opportunities")
    .select("id, company_name, lifecycle_stage, created_at, quote_request_id, sales_prospect_id")
    .eq("id", opportunityId)
    .maybeSingle();
  if (error || !data) return null;
  return data as {
    id: string;
    company_name: string | null;
    lifecycle_stage: string;
    created_at: string;
    quote_request_id: string | null;
    sales_prospect_id: number | null;
  };
}
