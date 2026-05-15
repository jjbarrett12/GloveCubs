/**
 * Server-only buyer account read model. Scoped by canonical company id from gate — never client ids.
 */

export type BuyerAccountQuoteRow = {
  id: string;
  status: string;
  created_at: string;
  submitted_at: string | null;
  company_name: string | null;
  contact_name: string | null;
  email: string | null;
  line_count: number;
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
      .select("id, status, created_at, submitted_at, company_name, contact_name, email")
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
    ...q,
    line_count: lineCountByQuote.get(q.id) ?? 0,
  }));

  return {
    quoteLinkedCount,
    trustedSpendObservationCount,
    recentQuotes,
  };
}

export type BuyerQuoteHistoryRow = BuyerAccountQuoteRow;

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
    .select("id, status, submitted_at, created_at, company_name, contact_name, email")
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
    ...q,
    line_count: lineCountByQuote.get(q.id) ?? 0,
  }));

  return { error: null, rows };
}
