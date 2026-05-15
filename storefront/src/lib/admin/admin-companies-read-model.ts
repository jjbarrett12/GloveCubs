/**
 * Admin customer/company read models. gc_commerce.companies is canonical tenant root.
 * Contact on directory rows comes from latest linked quote snapshot only.
 */

import { fetchAdminOrderList } from "@/lib/admin/admin-orders-read-model";

export type AdminCompanyDirectoryRow = {
  id: string;
  trade_name: string;
  slug: string;
  b2b_pricing_tier_code: string;
  status: string;
  member_count: number;
  quote_count: number;
  order_count: number;
  quicklist_count: number;
  derived_contact_email: string | null;
  last_activity_at: string | null;
};

export type AdminCompanyMemberRow = {
  id: string;
  user_id: string;
  role: string;
  joined_at: string;
  email: string | null;
};

export type AdminCompanyQuoteRow = {
  id: string;
  status: string;
  created_at: string;
  submitted_at: string | null;
  contact_name: string | null;
  email: string | null;
  line_count: number;
};

export type AdminCompanyOrderRow = {
  id: string;
  order_number: string;
  status: string;
  placed_at: string;
  currency_code: string;
};

export type AdminCompanyDetailDto = {
  company: {
    id: string;
    trade_name: string;
    legal_name: string | null;
    slug: string;
    country_code: string | null;
    status: string;
    b2b_pricing_tier_code: string;
    created_at: string;
    updated_at: string;
  };
  members: AdminCompanyMemberRow[];
  quote_count: number;
  order_count: number;
  recent_quotes: AdminCompanyQuoteRow[];
  recent_orders: AdminCompanyOrderRow[];
  latest_quote_contact: { contact_name: string | null; email: string | null } | null;
};

const DIRECTORY_LIMIT = 500;

function countByKey(rows: { key: string | null | undefined }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const id = r.key;
    if (!id) continue;
    m.set(id, (m.get(id) ?? 0) + 1);
  }
  return m;
}

function maxIso(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a && !b) return null;
  if (!a) return b ?? null;
  if (!b) return a;
  return a > b ? a : b;
}

export async function fetchAdminCompaniesDirectory(supabase: any): Promise<{
  rows: AdminCompanyDirectoryRow[];
  error: string | null;
}> {
  const { data: companies, error: cErr } = await supabase
    .schema("gc_commerce")
    .from("companies")
    .select("id, trade_name, slug, b2b_pricing_tier_code, status")
    .order("trade_name", { ascending: true })
    .limit(DIRECTORY_LIMIT);

  if (cErr) {
    return { rows: [], error: cErr.message };
  }

  const list = (companies ?? []) as Array<{
    id: string;
    trade_name: string;
    slug: string;
    b2b_pricing_tier_code: string;
    status: string;
  }>;

  const [memberRes, quoteRes, orderRes, quicklistRes] = await Promise.all([
    supabase.schema("gc_commerce").from("company_members").select("company_id"),
    supabase
      .schema("catalogos")
      .from("quote_requests")
      .select("gc_company_id, created_at, submitted_at, email")
      .not("gc_company_id", "is", null),
    supabase.schema("gc_commerce").from("orders").select("company_id, placed_at, created_at"),
    supabase
      .schema("gc_commerce")
      .from("company_quicklist_items")
      .select("company_id")
      .is("valid_to", null),
  ]);

  const memberCounts = countByKey(
    ((memberRes.data ?? []) as { company_id: string }[]).map((r) => ({ key: r.company_id }))
  );
  const quoteCounts = countByKey(
    ((quoteRes.data ?? []) as { gc_company_id: string }[]).map((r) => ({ key: r.gc_company_id }))
  );
  const orderCounts = countByKey(
    ((orderRes.data ?? []) as { company_id: string }[]).map((r) => ({ key: r.company_id }))
  );
  const quicklistCounts = quicklistRes.error
    ? new Map<string, number>()
    : countByKey(
        ((quicklistRes.data ?? []) as { company_id: string }[]).map((r) => ({ key: r.company_id }))
      );

  const lastQuoteAt = new Map<string, string>();
  const latestQuoteEmail = new Map<string, string>();
  for (const r of (quoteRes.data ?? []) as {
    gc_company_id: string | null;
    created_at?: string;
    submitted_at?: string | null;
    email?: string | null;
  }[]) {
    const cid = r.gc_company_id;
    if (!cid) continue;
    const t = r.submitted_at || r.created_at;
    if (t) {
      const prev = lastQuoteAt.get(cid);
      if (!prev || t > prev) {
        lastQuoteAt.set(cid, t);
        const em = r.email?.trim();
        if (em) latestQuoteEmail.set(cid, em);
      }
    }
  }

  const lastOrderAt = new Map<string, string>();
  for (const r of (orderRes.data ?? []) as {
    company_id: string;
    placed_at?: string;
    created_at?: string;
  }[]) {
    const cid = r.company_id;
    if (!cid) continue;
    const t = r.placed_at || r.created_at;
    if (!t) continue;
    const prev = lastOrderAt.get(cid);
    if (!prev || t > prev) lastOrderAt.set(cid, t);
  }

  const rows: AdminCompanyDirectoryRow[] = list.map((c) => ({
    id: c.id,
    trade_name: c.trade_name,
    slug: c.slug,
    b2b_pricing_tier_code: c.b2b_pricing_tier_code,
    status: c.status,
    member_count: memberCounts.get(c.id) ?? 0,
    quote_count: quoteCounts.get(c.id) ?? 0,
    order_count: orderCounts.get(c.id) ?? 0,
    quicklist_count: quicklistCounts.get(c.id) ?? 0,
    derived_contact_email: latestQuoteEmail.get(c.id) ?? null,
    last_activity_at: maxIso(lastQuoteAt.get(c.id), lastOrderAt.get(c.id)),
  }));

  return { rows, error: null };
}

async function resolveMemberEmails(
  supabase: any,
  members: { id: string; user_id: string; role: string; joined_at: string }[]
): Promise<AdminCompanyMemberRow[]> {
  const out: AdminCompanyMemberRow[] = [];
  for (const m of members) {
    let email: string | null = null;
    try {
      const { data, error } = await supabase.auth.admin.getUserById(m.user_id);
      if (!error && data?.user?.email) {
        email = data.user.email;
      }
    } catch {
      email = null;
    }
    out.push({
      id: m.id,
      user_id: m.user_id,
      role: m.role,
      joined_at: m.joined_at,
      email,
    });
  }
  return out;
}

export async function fetchAdminCompanyDetail(
  supabase: any,
  companyId: string
): Promise<{ detail: AdminCompanyDetailDto | null; error: string | null }> {
  const { data: co, error: coErr } = await supabase
    .schema("gc_commerce")
    .from("companies")
    .select(
      "id, trade_name, legal_name, slug, country_code, status, b2b_pricing_tier_code, created_at, updated_at"
    )
    .eq("id", companyId)
    .maybeSingle();

  if (coErr) {
    return { detail: null, error: coErr.message };
  }
  if (!co) {
    return { detail: null, error: null };
  }

  const [memberRes, quoteCountRes, orderCountRes, quotesRes, orderListRes] = await Promise.all([
    supabase
      .schema("gc_commerce")
      .from("company_members")
      .select("id, user_id, role, joined_at")
      .eq("company_id", companyId)
      .order("joined_at", { ascending: true }),
    supabase
      .schema("catalogos")
      .from("quote_requests")
      .select("id", { count: "exact", head: true })
      .eq("gc_company_id", companyId),
    supabase
      .schema("gc_commerce")
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId),
    supabase
      .schema("catalogos")
      .from("quote_requests")
      .select("id, status, created_at, submitted_at, contact_name, email")
      .eq("gc_company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(10),
    fetchAdminOrderList(supabase, { companyId, limit: 10, offset: 0 }),
  ]);

  const rawMembers = (memberRes.data ?? []) as {
    id: string;
    user_id: string;
    role: string;
    joined_at: string;
  }[];
  const members = await resolveMemberEmails(supabase, rawMembers);

  const rawQuotes = (quotesRes.data ?? []) as AdminCompanyQuoteRow[];
  const quoteIds = rawQuotes.map((q) => q.id);
  const lineCountByQuote = new Map<string, number>();
  if (quoteIds.length > 0) {
    const { data: lineRows } = await supabase
      .schema("catalogos")
      .from("quote_line_items")
      .select("quote_request_id")
      .in("quote_request_id", quoteIds);
    for (const row of (lineRows ?? []) as { quote_request_id: string }[]) {
      const qid = String(row.quote_request_id);
      lineCountByQuote.set(qid, (lineCountByQuote.get(qid) ?? 0) + 1);
    }
  }

  const recent_quotes: AdminCompanyQuoteRow[] = rawQuotes.map((q) => ({
    ...q,
    line_count: lineCountByQuote.get(q.id) ?? 0,
  }));

  const latest = recent_quotes[0];
  const latest_quote_contact = latest
    ? { contact_name: latest.contact_name, email: latest.email }
    : null;

  const recent_orders: AdminCompanyOrderRow[] = orderListRes.rows.map((o) => ({
    id: o.id,
    order_number: o.order_number,
    status: o.status,
    placed_at: o.placed_at,
    currency_code: o.currency_code,
  }));

  const c = co as Record<string, unknown>;

  return {
    detail: {
      company: {
        id: String(c.id),
        trade_name: String(c.trade_name),
        legal_name: c.legal_name != null ? String(c.legal_name) : null,
        slug: String(c.slug),
        country_code: c.country_code != null ? String(c.country_code) : null,
        status: String(c.status),
        b2b_pricing_tier_code: String(c.b2b_pricing_tier_code),
        created_at: String(c.created_at),
        updated_at: String(c.updated_at),
      },
      members,
      quote_count: quoteCountRes.error ? 0 : (quoteCountRes.count ?? 0),
      order_count: orderCountRes.error ? 0 : (orderCountRes.count ?? 0),
      recent_quotes,
      recent_orders,
      latest_quote_contact,
    },
    error: null,
  };
}
