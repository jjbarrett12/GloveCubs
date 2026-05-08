/**
 * Phase 7 — customer-only procurement read models. Narrow selects, governance filters, customer DTOs only.
 * Do not import admin workspace DTOs; do not expose internal trust states or matcher payloads.
 */

import type { ProcurementEventTypeId } from "@/lib/procurement/event-taxonomy";
import { ProcurementEventType } from "@/lib/procurement/event-taxonomy";
import { revalidateSavingsOpportunityForApproval } from "@/lib/procurement/recommendation-lifecycle-service";
import { fetchStoreProductRowsByIds } from "@/lib/catalog/store-products";

const DEFAULT_LIMIT = 80;
const TIMELINE_LIMIT = 120;
const MEMORY_SCAN = 400;

/** Procurement spine events surfaced to customers (no intake/AI/matcher/governance reject noise). */
export const CUSTOMER_PROCUREMENT_TIMELINE_EVENT_TYPES: readonly ProcurementEventTypeId[] = [
  ProcurementEventType.recommendation_approved,
  ProcurementEventType.reorder_product_promoted,
  ProcurementEventType.reorder_product_retired,
  ProcurementEventType.trusted_spend_promoted,
  ProcurementEventType.customer_viewed_recommendation,
  ProcurementEventType.customer_acknowledged_recommendation,
  ProcurementEventType.customer_requested_reorder,
  ProcurementEventType.customer_requested_quote,
  ProcurementEventType.customer_asked_about_alternate,
  ProcurementEventType.customer_viewed_procurement_history,
  ProcurementEventType.customer_contacted_procurement_advisor,
] as const;

/** Keys allowed on customer-facing opportunity DTOs (for tests / drift guard). */
export const CUSTOMER_APPROVED_OPPORTUNITY_DTO_KEYS = [
  "id",
  "basis_uom",
  "approved_for_customer_at",
  "procurement_opportunity_id",
  "source_product",
  "candidate_product",
  "economics",
] as const;

export type CustomerProductRef = {
  catalog_product_id: string;
  label: string;
  slug: string | null;
};

export type CustomerApprovedOpportunityEconomics = {
  source_unit_price_normalized: number;
  candidate_unit_price_normalized: number;
  estimated_delta_per_basis: number;
  observed_at_source: string;
  observed_at_candidate: string;
};

export type CustomerApprovedOpportunityDto = {
  id: string;
  basis_uom: string;
  approved_for_customer_at: string | null;
  procurement_opportunity_id: string | null;
  source_product: CustomerProductRef;
  candidate_product: CustomerProductRef;
  economics: CustomerApprovedOpportunityEconomics;
};

export type CustomerReorderRowDto = {
  id: string;
  catalog_product_id: string;
  product_label: string;
  product_slug: string | null;
  basis_uom: string;
  last_trusted_unit_basis: number | null;
  promoted_at: string;
};

export type CustomerTrustedSpendRowDto = {
  id: string;
  observed_at: string;
  catalog_product_id: string;
  product_label: string;
  catalogos_supplier_id: string | null;
  supplier_label: string | null;
  quantity: number | null;
  unit_price: number | null;
  line_total: number | null;
};

export type CustomerMemoryRowDto = {
  catalog_product_id: string;
  product_label: string;
  catalogos_supplier_id: string | null;
  supplier_label: string | null;
  last_observed_at: string;
  last_unit_price: number | null;
};

export type CustomerTimelineRowDto = {
  id: string;
  event_type: ProcurementEventTypeId;
  occurred_at: string;
  headline: string;
  detail: string | null;
};

async function attachProcurementOpportunityIds(
  supabase: any,
  rows: Record<string, unknown>[]
): Promise<Record<string, unknown>[]> {
  if (rows.length === 0) return [];
  const lineIds = Array.from(new Set(rows.map((r) => String(r.source_invoice_line_id))));
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
  return rows.map((r) => {
    const uid = lineToUpload.get(String(r.source_invoice_line_id));
    return { ...r, procurement_opportunity_id: uid ? uploadToOpp.get(uid) ?? null : null };
  });
}

function productRefFromStore(
  catalogProductId: string,
  byId: Map<string, { name: string; slug: string }>
): CustomerProductRef {
  const row = byId.get(catalogProductId);
  return {
    catalog_product_id: catalogProductId,
    label: row?.name?.trim() ? row.name : `Product ${catalogProductId.slice(0, 8)}…`,
    slug: row?.slug ?? null,
  };
}

/** Exposed for tests — ensures DTOs never carry unexpected keys. */
export function assertCustomerApprovedOpportunityDtoShape(dto: CustomerApprovedOpportunityDto): void {
  const keys = Object.keys(dto).sort();
  const allowed = [...CUSTOMER_APPROVED_OPPORTUNITY_DTO_KEYS].sort();
  const extra = keys.filter((k) => !allowed.includes(k as (typeof CUSTOMER_APPROVED_OPPORTUNITY_DTO_KEYS)[number]));
  if (extra.length) throw new Error(`customer_opportunity_dto_leak:${extra.join(",")}`);
}

/**
 * Approved-for-customer opportunities that still pass economic revalidation (stale rows are omitted).
 */
export async function fetchCustomerApprovedOpportunities(
  supabase: any,
  companyId: string,
  limit = DEFAULT_LIMIT
): Promise<CustomerApprovedOpportunityDto[]> {
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("savings_opportunities")
    .select(
      "id, company_id, source_invoice_line_id, source_catalog_product_id, candidate_catalog_product_id, basis_uom, source_unit_price_normalized, candidate_unit_price_normalized, estimated_delta_per_basis, trust_status, approved_for_customer_at, created_at"
    )
    .eq("company_id", companyId)
    .eq("trust_status", "approved_for_customer")
    .order("approved_for_customer_at", { ascending: false })
    .limit(limit);
  const base = (error ? [] : (data ?? [])) as Record<string, unknown>[];
  if (base.length === 0) return [];
  const enriched = await attachProcurementOpportunityIds(supabase, base);
  const productIds = Array.from(
    new Set(
      enriched.flatMap((r) => [String(r.source_catalog_product_id), String(r.candidate_catalog_product_id)])
    )
  );
  const storeRows = await fetchStoreProductRowsByIds(productIds);
  const byId = new Map(storeRows.map((p) => [p.id, { name: p.name, slug: p.slug }]));

  const out: CustomerApprovedOpportunityDto[] = [];
  for (const r of enriched) {
    const stale = await revalidateSavingsOpportunityForApproval(supabase, r);
    if (!stale.ok) continue;

    const snap = stale.economic_snapshot as {
      source_unit_price_normalized: number;
      candidate_unit_price_normalized: number;
      estimated_delta_per_basis: number;
      observed_at_source: string;
      observed_at_candidate: string;
    };
    const srcId = String(r.source_catalog_product_id);
    const candId = String(r.candidate_catalog_product_id);
    const dto: CustomerApprovedOpportunityDto = {
      id: String(r.id),
      basis_uom: String(r.basis_uom),
      approved_for_customer_at: r.approved_for_customer_at != null ? String(r.approved_for_customer_at) : null,
      procurement_opportunity_id: r.procurement_opportunity_id != null ? String(r.procurement_opportunity_id) : null,
      source_product: productRefFromStore(srcId, byId),
      candidate_product: productRefFromStore(candId, byId),
      economics: {
        source_unit_price_normalized: snap.source_unit_price_normalized,
        candidate_unit_price_normalized: snap.candidate_unit_price_normalized,
        estimated_delta_per_basis: snap.estimated_delta_per_basis,
        observed_at_source: snap.observed_at_source,
        observed_at_candidate: snap.observed_at_candidate,
      },
    };
    assertCustomerApprovedOpportunityDtoShape(dto);
    out.push(dto);
  }
  return out;
}

/**
 * When an opportunity is approved for customer but no longer revalidates, return a safe shell (no economics).
 */
export async function fetchCustomerOpportunityPresentationState(
  supabase: any,
  companyId: string,
  savingsOpportunityId: string
): Promise<{ kind: "active"; dto: CustomerApprovedOpportunityDto } | { kind: "under_review"; id: string } | null> {
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("savings_opportunities")
    .select(
      "id, company_id, source_invoice_line_id, source_catalog_product_id, candidate_catalog_product_id, basis_uom, source_unit_price_normalized, candidate_unit_price_normalized, estimated_delta_per_basis, trust_status, approved_for_customer_at, created_at"
    )
    .eq("id", savingsOpportunityId)
    .eq("company_id", companyId)
    .eq("trust_status", "approved_for_customer")
    .maybeSingle();
  if (error || !data) return null;
  const row = (await attachProcurementOpportunityIds(supabase, [data as Record<string, unknown>]))[0]!;
  const stale = await revalidateSavingsOpportunityForApproval(supabase, row);
  if (!stale.ok) return { kind: "under_review", id: String(row.id) };
  const snap = stale.economic_snapshot as {
    source_unit_price_normalized: number;
    candidate_unit_price_normalized: number;
    estimated_delta_per_basis: number;
    observed_at_source: string;
    observed_at_candidate: string;
  };
  const srcId = String(row.source_catalog_product_id);
  const candId = String(row.candidate_catalog_product_id);
  const productIds = [srcId, candId];
  const storeRows = await fetchStoreProductRowsByIds(productIds);
  const byId = new Map(storeRows.map((p) => [p.id, { name: p.name, slug: p.slug }]));
  const dto: CustomerApprovedOpportunityDto = {
    id: String(row.id),
    basis_uom: String(row.basis_uom),
    approved_for_customer_at: row.approved_for_customer_at != null ? String(row.approved_for_customer_at) : null,
    procurement_opportunity_id: row.procurement_opportunity_id != null ? String(row.procurement_opportunity_id) : null,
    source_product: productRefFromStore(srcId, byId),
    candidate_product: productRefFromStore(candId, byId),
    economics: {
      source_unit_price_normalized: snap.source_unit_price_normalized,
      candidate_unit_price_normalized: snap.candidate_unit_price_normalized,
      estimated_delta_per_basis: snap.estimated_delta_per_basis,
      observed_at_source: snap.observed_at_source,
      observed_at_candidate: snap.observed_at_candidate,
    },
  };
  assertCustomerApprovedOpportunityDtoShape(dto);
  return { kind: "active", dto };
}

export async function fetchCustomerReorderRows(
  supabase: any,
  companyId: string,
  limit = DEFAULT_LIMIT
): Promise<CustomerReorderRowDto[]> {
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("procurement_reorder_memory")
    .select("id, company_id, catalog_product_id, basis_uom, last_trusted_unit_basis, promoted_at, valid_to")
    .eq("company_id", companyId)
    .is("valid_to", null)
    .order("promoted_at", { ascending: false })
    .limit(limit);
  const rows = (error ? [] : (data ?? [])) as Record<string, unknown>[];
  if (rows.length === 0) return [];
  const ids = rows.map((r) => String(r.catalog_product_id));
  const storeRows = await fetchStoreProductRowsByIds(ids);
  const byId = new Map(storeRows.map((p) => [p.id, p]));
  return rows.map((r) => {
    const pid = String(r.catalog_product_id);
    const p = byId.get(pid);
    return {
      id: String(r.id),
      catalog_product_id: pid,
      product_label: p?.name?.trim() ? p.name : `Product ${pid.slice(0, 8)}…`,
      product_slug: p?.slug ?? null,
      basis_uom: String(r.basis_uom),
      last_trusted_unit_basis: r.last_trusted_unit_basis != null ? Number(r.last_trusted_unit_basis) : null,
      promoted_at: String(r.promoted_at),
    };
  });
}

export async function fetchCustomerTrustedSpendRows(
  supabase: any,
  companyId: string,
  limit = DEFAULT_LIMIT
): Promise<CustomerTrustedSpendRowDto[]> {
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("price_observations")
    .select(
      "id, observed_at, catalog_product_id, catalogos_supplier_id, quantity, unit_price, line_total, trust_status, company_id"
    )
    .eq("company_id", companyId)
    .eq("trust_status", "trusted")
    .order("observed_at", { ascending: false })
    .limit(limit);
  const rows = (error ? [] : (data ?? [])) as Record<string, unknown>[];
  if (rows.length === 0) return [];
  const productIds = Array.from(new Set(rows.map((r) => String(r.catalog_product_id))));
  const supplierIds = Array.from(
    new Set(rows.map((r) => (r.catalogos_supplier_id != null ? String(r.catalogos_supplier_id) : null)).filter(Boolean))
  ) as string[];
  const storeRows = await fetchStoreProductRowsByIds(productIds);
  const pById = new Map(storeRows.map((p) => [p.id, p]));
  const sById = new Map<string, string>();
  if (supplierIds.length > 0) {
    const { data: sups } = await supabase.schema("catalogos").from("suppliers").select("id, name").in("id", supplierIds);
    for (const s of (sups ?? []) as { id: string; name: string }[]) {
      sById.set(String(s.id), s.name);
    }
  }
  return rows.map((r) => {
    const pid = String(r.catalog_product_id);
    const p = pById.get(pid);
    const sid = r.catalogos_supplier_id != null ? String(r.catalogos_supplier_id) : null;
    return {
      id: String(r.id),
      observed_at: String(r.observed_at),
      catalog_product_id: pid,
      product_label: p?.name?.trim() ? p.name : `Product ${pid.slice(0, 8)}…`,
      catalogos_supplier_id: sid,
      supplier_label: sid ? sById.get(sid) ?? null : null,
      quantity: r.quantity != null ? Number(r.quantity) : null,
      unit_price: r.unit_price != null ? Number(r.unit_price) : null,
      line_total: r.line_total != null ? Number(r.line_total) : null,
    };
  });
}

/** Last trusted observation per product+supplier (bounded scan; operational, not BI). */
export async function fetchCustomerSupplierProductMemory(
  supabase: any,
  companyId: string,
  scanLimit = MEMORY_SCAN
): Promise<CustomerMemoryRowDto[]> {
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("price_observations")
    .select("id, observed_at, catalog_product_id, catalogos_supplier_id, unit_price, trust_status, company_id")
    .eq("company_id", companyId)
    .eq("trust_status", "trusted")
    .order("observed_at", { ascending: false })
    .limit(scanLimit);
  const rows = (error ? [] : (data ?? [])) as Record<string, unknown>[];
  const best = new Map<
    string,
    { catalog_product_id: string; catalogos_supplier_id: string | null; last_observed_at: string; last_unit_price: number | null }
  >();
  for (const r of rows) {
    const pid = String(r.catalog_product_id);
    const sid = r.catalogos_supplier_id != null ? String(r.catalogos_supplier_id) : null;
    const key = `${pid}::${sid ?? "none"}`;
    if (best.has(key)) continue;
    best.set(key, {
      catalog_product_id: pid,
      catalogos_supplier_id: sid,
      last_observed_at: String(r.observed_at),
      last_unit_price: r.unit_price != null ? Number(r.unit_price) : null,
    });
  }
  const list = Array.from(best.values());
  const productIds = Array.from(new Set(list.map((x) => x.catalog_product_id)));
  const supplierIds = Array.from(new Set(list.map((x) => x.catalogos_supplier_id).filter(Boolean))) as string[];
  const storeRows = await fetchStoreProductRowsByIds(productIds);
  const pById = new Map(storeRows.map((p) => [p.id, p]));
  const sById = new Map<string, string>();
  if (supplierIds.length > 0) {
    const { data: sups } = await supabase.schema("catalogos").from("suppliers").select("id, name").in("id", supplierIds);
    for (const s of (sups ?? []) as { id: string; name: string }[]) {
      sById.set(String(s.id), s.name);
    }
  }
  return list.map((m) => {
    const p = pById.get(m.catalog_product_id);
    return {
      catalog_product_id: m.catalog_product_id,
      product_label: p?.name?.trim() ? p.name : `Product ${m.catalog_product_id.slice(0, 8)}…`,
      catalogos_supplier_id: m.catalogos_supplier_id,
      supplier_label: m.catalogos_supplier_id ? sById.get(m.catalogos_supplier_id) ?? null : null,
      last_observed_at: m.last_observed_at,
      last_unit_price: m.last_unit_price,
    };
  });
}

export async function fetchProcurementOpportunityIdsForCompany(supabase: any, companyId: string): Promise<string[]> {
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("uploaded_invoices")
    .select("procurement_opportunity_id")
    .eq("company_id", companyId)
    .not("procurement_opportunity_id", "is", null)
    .limit(500);
  if (error || !data?.length) return [];
  const ids = Array.from(
    new Set(
      (data as { procurement_opportunity_id: string }[]).map((r) => String(r.procurement_opportunity_id))
    )
  );
  return ids;
}

function formatDeltaPlain(delta: number, basis: string): string {
  const d = Number(delta);
  if (!Number.isFinite(d)) return "";
  const sign = d > 0 ? "lower" : d < 0 ? "higher" : "unchanged";
  const abs = Math.abs(d);
  return `Candidate unit economics on the recorded basis (${basis}) are ${sign} by ${abs.toFixed(4)} per basis vs. the current line (deterministic; not a price guarantee).`;
}

export function mapRawProcurementEventToCustomerTimelineRow(raw: Record<string, unknown>): CustomerTimelineRowDto | null {
  const eventType = String(raw.event_type) as ProcurementEventTypeId;
  if (!CUSTOMER_PROCUREMENT_TIMELINE_EVENT_TYPES.includes(eventType)) return null;
  const payload = (typeof raw.payload === "object" && raw.payload !== null ? raw.payload : {}) as Record<
    string,
    unknown
  >;
  const occurredAt = String(raw.created_at ?? payload.occurred_at ?? "");
  const id = String(raw.id);

  switch (eventType) {
    case ProcurementEventType.recommendation_approved: {
      const basis = payload.basis_uom != null ? String(payload.basis_uom) : "recorded basis";
      const src = payload.source_unit_price_normalized != null ? Number(payload.source_unit_price_normalized) : null;
      const cand = payload.candidate_unit_price_normalized != null ? Number(payload.candidate_unit_price_normalized) : null;
      const delta = payload.estimated_delta_per_basis != null ? Number(payload.estimated_delta_per_basis) : null;
      let detail: string | null = "Approved for your procurement workspace after operator review.";
      if (src != null && cand != null && delta != null && Number.isFinite(delta)) {
        detail = `${detail} ${formatDeltaPlain(delta, basis)}`;
      }
      return {
        id,
        event_type: eventType,
        occurred_at: occurredAt,
        headline: "Approved alternate recorded",
        detail,
      };
    }
    case ProcurementEventType.reorder_product_promoted:
      return {
        id,
        event_type: eventType,
        occurred_at: occurredAt,
        headline: "Reorder item added",
        detail: "An operator promoted a product into your reorder list.",
      };
    case ProcurementEventType.reorder_product_retired:
      return {
        id,
        event_type: eventType,
        occurred_at: occurredAt,
        headline: "Reorder item retired",
        detail: "An operator retired a reorder item.",
      };
    case ProcurementEventType.trusted_spend_promoted:
      return {
        id,
        event_type: eventType,
        occurred_at: occurredAt,
        headline: "Trusted spend updated",
        detail: "Trusted procurement spend memory was updated.",
      };
    case ProcurementEventType.customer_viewed_recommendation:
      return {
        id,
        event_type: eventType,
        occurred_at: occurredAt,
        headline: "You viewed an approved note",
        detail: null,
      };
    case ProcurementEventType.customer_acknowledged_recommendation:
      return {
        id,
        event_type: eventType,
        occurred_at: occurredAt,
        headline: "You acknowledged an approved note",
        detail: null,
      };
    case ProcurementEventType.customer_requested_reorder:
      return {
        id,
        event_type: eventType,
        occurred_at: occurredAt,
        headline: "Reorder request sent",
        detail: "Your team will follow up on this request.",
      };
    case ProcurementEventType.customer_requested_quote:
      return {
        id,
        event_type: eventType,
        occurred_at: occurredAt,
        headline: "Quote request sent",
        detail: "Your team will follow up on this request.",
      };
    case ProcurementEventType.customer_asked_about_alternate:
      return {
        id,
        event_type: eventType,
        occurred_at: occurredAt,
        headline: "Question on an approved alternate",
        detail: "Your procurement contact will respond.",
      };
    case ProcurementEventType.customer_viewed_procurement_history:
      return {
        id,
        event_type: eventType,
        occurred_at: occurredAt,
        headline: "Procurement history viewed",
        detail: null,
      };
    case ProcurementEventType.customer_contacted_procurement_advisor:
      return {
        id,
        event_type: eventType,
        occurred_at: occurredAt,
        headline: "Procurement advisor contact",
        detail: "A message was sent to your procurement team.",
      };
    default:
      return null;
  }
}

export async function fetchCustomerProcurementTimeline(
  supabase: any,
  companyId: string,
  limit = TIMELINE_LIMIT
): Promise<CustomerTimelineRowDto[]> {
  const oppIds = await fetchProcurementOpportunityIdsForCompany(supabase, companyId);
  if (oppIds.length === 0) return [];
  const { data, error } = await supabase
    .from("procurement_events")
    .select("id, event_type, payload, created_at")
    .in("opportunity_id", oppIds)
    .in("event_type", [...CUSTOMER_PROCUREMENT_TIMELINE_EVENT_TYPES])
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = (error ? [] : (data ?? [])) as Record<string, unknown>[];
  const mapped = rows
    .map((r) => mapRawProcurementEventToCustomerTimelineRow(r))
    .filter((x): x is CustomerTimelineRowDto => Boolean(x));
  mapped.sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : a.occurred_at > b.occurred_at ? -1 : a.id < b.id ? 1 : -1));
  return mapped;
}
