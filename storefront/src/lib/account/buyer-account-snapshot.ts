/**
 * Server-only buyer account read model. Scoped by canonical company id from gate — never client ids.
 */

import {
  mapRawProcurementEventToCustomerTimelineRow,
  type CustomerTimelineRowDto,
} from "@/lib/procurement/customer-procurement-read-models";

export type BuyerAccountQuoteRow = {
  id: string;
  status: string;
  created_at: string;
  submitted_at: string | null;
  company_name: string | null;
  contact_name: string | null;
  email: string | null;
  line_count: number;
  ship_to_address_id: string | null;
  ship_to_label: string | null;
  ship_to_snapshot: unknown | null;
};

export type BuyerAccountSnapshot = {
  quoteLinkedCount: number | null;
  trustedSpendObservationCount: number | null;
  recentQuotes: BuyerAccountQuoteRow[];
};

export async function fetchBuyerAccountSnapshot(supabase: any, companyId: string): Promise<BuyerAccountSnapshot> {
  const [countRes, spendRes, quotesRes] = await Promise.all([
    supabase
      .schema("catalogos")
      .from("quote_requests")
      .select("id", { count: "exact", head: true })
      .eq("gc_company_id", companyId),
    supabase
      .schema("gc_commerce")
      .from("price_observations")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("trust_status", "trusted"),
    supabase
      .schema("catalogos")
      .from("quote_requests")
      .select("id, status, created_at, submitted_at, company_name, contact_name, email, ship_to_address_id, ship_to_label, ship_to_snapshot")
      .eq("gc_company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const quoteLinkedCount = countRes.error ? null : (countRes.count ?? 0);
  const trustedSpendObservationCount = spendRes.error ? null : (spendRes.count ?? 0);

  const rawQuotes = (quotesRes.error ? [] : (quotesRes.data ?? [])) as Array<{
    id: string;
    status: string;
    created_at: string;
    submitted_at: string | null;
    company_name: string | null;
    contact_name: string | null;
    email: string | null;
    ship_to_address_id: string | null;
    ship_to_label: string | null;
    ship_to_snapshot: unknown | null;
  }>;

  const ids = rawQuotes.map((q) => q.id);
  const lineCountByQuote = new Map<string, number>();
  if (ids.length > 0) {
    const { data: lineRows, error: lineErr } = await supabase
      .schema("catalogos")
      .from("quote_line_items")
      .select("quote_request_id")
      .in("quote_request_id", ids);
    if (!lineErr && lineRows) {
      for (const row of lineRows as { quote_request_id: string }[]) {
        const qid = String(row.quote_request_id);
        lineCountByQuote.set(qid, (lineCountByQuote.get(qid) ?? 0) + 1);
      }
    }
  }

  const recentQuotes: BuyerAccountQuoteRow[] = rawQuotes.map((q) => ({
    id: q.id,
    status: q.status,
    created_at: q.created_at,
    submitted_at: q.submitted_at,
    company_name: q.company_name,
    contact_name: q.contact_name,
    email: q.email,
    ship_to_address_id: q.ship_to_address_id ?? null,
    ship_to_label: q.ship_to_label ?? null,
    ship_to_snapshot: q.ship_to_snapshot ?? null,
    line_count: lineCountByQuote.get(q.id) ?? 0,
  }));

  return {
    quoteLinkedCount,
    trustedSpendObservationCount,
    recentQuotes,
  };
}

/**
 * Quote history for /account/quotes — always filtered by gc_company_id (server gate company id).
 */
export async function fetchBuyerQuoteHistoryWithLines(
  supabase: any,
  companyId: string,
  limit = 100
): Promise<{ error: string | null; rows: BuyerQuoteHistoryRow[] }> {
  const { data: quotes, error } = await supabase
    .schema("catalogos")
    .from("quote_requests")
    .select("id, status, submitted_at, created_at, company_name, contact_name, email, ship_to_address_id, ship_to_label, ship_to_snapshot")
    .eq("gc_company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return { error: error.message, rows: [] };
  }

  const rawQuotes = (quotes ?? []) as Array<{
    id: string;
    status: string;
    submitted_at: string | null;
    created_at: string;
    company_name: string | null;
    contact_name: string | null;
    email: string | null;
    ship_to_address_id: string | null;
    ship_to_label: string | null;
    ship_to_snapshot: unknown | null;
  }>;

  const ids = rawQuotes.map((q) => q.id);
  const lineCountByQuote = new Map<string, number>();
  if (ids.length > 0) {
    const { data: lineRows, error: lineErr } = await supabase
      .schema("catalogos")
      .from("quote_line_items")
      .select("quote_request_id")
      .in("quote_request_id", ids);
    if (!lineErr && lineRows) {
      for (const row of lineRows as { quote_request_id: string }[]) {
        const qid = String(row.quote_request_id);
        lineCountByQuote.set(qid, (lineCountByQuote.get(qid) ?? 0) + 1);
      }
    }
  }

  const rows: BuyerQuoteHistoryRow[] = rawQuotes.map((q) => ({
    id: q.id,
    status: q.status,
    created_at: q.created_at,
    submitted_at: q.submitted_at,
    company_name: q.company_name,
    contact_name: q.contact_name,
    email: q.email,
    ship_to_address_id: q.ship_to_address_id ?? null,
    ship_to_label: q.ship_to_label ?? null,
    ship_to_snapshot: q.ship_to_snapshot ?? null,
    line_count: lineCountByQuote.get(q.id) ?? 0,
  }));

  return { error: null, rows };
}

export type BuyerQuoteHistoryRow = BuyerAccountQuoteRow;

export type BuyerQuoteLineItem = {
  id: string;
  product_id: string;
  quantity: number;
  notes: string | null;
  product_snapshot: Record<string, unknown>;
};

export type BuyerQuoteDetail = {
  quote: BuyerAccountQuoteRow & {
    notes: string | null;
    phone: string | null;
  };
  lines: BuyerQuoteLineItem[];
  linkedOpportunity: { id: string; lifecycle_stage: string } | null;
  timeline: CustomerTimelineRowDto[];
};

function snapshotProductLabel(snapshot: Record<string, unknown>): string {
  const name = snapshot.product_name;
  if (typeof name === "string" && name.trim()) return name.trim();
  return "Catalog line";
}

export { snapshotProductLabel };

/**
 * Single quote for /account/quotes/[quoteId] — scoped by gc_company_id.
 */
export async function fetchBuyerQuoteDetail(
  supabase: any,
  companyId: string,
  quoteId: string
): Promise<{ error: string | null; notFound?: boolean; detail: BuyerQuoteDetail | null }> {
  const { data: quoteRaw, error: quoteErr } = await supabase
    .schema("catalogos")
    .from("quote_requests")
    .select(
      "id, status, submitted_at, created_at, company_name, contact_name, email, phone, notes, ship_to_address_id, ship_to_label, ship_to_snapshot"
    )
    .eq("id", quoteId)
    .eq("gc_company_id", companyId)
    .maybeSingle();

  if (quoteErr) {
    return { error: quoteErr.message, detail: null };
  }
  if (!quoteRaw) {
    return { error: null, notFound: true, detail: null };
  }

  const q = quoteRaw as {
    id: string;
    status: string;
    submitted_at: string | null;
    created_at: string;
    company_name: string | null;
    contact_name: string | null;
    email: string | null;
    phone: string | null;
    notes: string | null;
    ship_to_address_id: string | null;
    ship_to_label: string | null;
    ship_to_snapshot: unknown | null;
  };

  const { data: lineRows, error: lineErr } = await supabase
    .schema("catalogos")
    .from("quote_line_items")
    .select("id, product_id, quantity, notes, product_snapshot")
    .eq("quote_request_id", quoteId)
    .order("created_at", { ascending: true });

  if (lineErr) {
    return { error: lineErr.message, detail: null };
  }

  const lines: BuyerQuoteLineItem[] = ((lineRows ?? []) as Array<{
    id: string;
    product_id: string;
    quantity: number;
    notes: string | null;
    product_snapshot: Record<string, unknown> | null;
  }>).map((row) => ({
    id: String(row.id),
    product_id: String(row.product_id),
    quantity: Number(row.quantity ?? 0),
    notes: row.notes ?? null,
    product_snapshot:
      row.product_snapshot && typeof row.product_snapshot === "object" ? row.product_snapshot : {},
  }));

  const { data: oppRaw } = await supabase
    .from("procurement_opportunities")
    .select("id, lifecycle_stage")
    .eq("quote_request_id", quoteId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const linkedOpportunity =
    oppRaw && typeof (oppRaw as { id?: unknown }).id === "string"
      ? {
          id: String((oppRaw as { id: string }).id),
          lifecycle_stage: String((oppRaw as { lifecycle_stage?: string }).lifecycle_stage ?? "open"),
        }
      : null;

  let timeline: CustomerTimelineRowDto[] = [];
  if (linkedOpportunity) {
    const { data: events } = await supabase
      .from("procurement_events")
      .select("id, event_type, payload, created_at")
      .eq("opportunity_id", linkedOpportunity.id)
      .order("created_at", { ascending: false })
      .limit(12);
    timeline = ((events ?? []) as Record<string, unknown>[])
      .map((raw) => mapRawProcurementEventToCustomerTimelineRow(raw))
      .filter((row): row is CustomerTimelineRowDto => row != null)
      .reverse();
  }

  return {
    error: null,
    detail: {
      quote: {
        id: q.id,
        status: q.status,
        created_at: q.created_at,
        submitted_at: q.submitted_at,
        company_name: q.company_name,
        contact_name: q.contact_name,
        email: q.email,
        phone: q.phone,
        notes: q.notes,
        ship_to_address_id: q.ship_to_address_id ?? null,
        ship_to_label: q.ship_to_label ?? null,
        ship_to_snapshot: q.ship_to_snapshot ?? null,
        line_count: lines.length,
      },
      lines,
      linkedOpportunity,
      timeline,
    },
  };
}
