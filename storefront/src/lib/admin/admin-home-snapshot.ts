import { fetchCatalogHealth } from "@/lib/admin/catalog-health";
import {
  buildAdminContaminationCountMeta,
  getContaminationExclusionReason,
  isLikelyTestData,
  shouldExcludeFromAdminKpi,
  sumExcludedFromMetrics,
  anyPartialContaminationScan,
  sumFlaggedVisibleFromRows,
  type AdminContaminationCountMeta,
  type ContaminationEntityType,
} from "@/lib/admin/contamination-filters";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";

const KPI_SCAN_LIMIT = 5000;

export type AdminRecentQuoteRow = {
  id: string;
  status: string;
  company_name: string | null;
  contact_name: string | null;
  created_at: string;
  submitted_at: string | null;
  gc_company_id: string | null;
  /** Present on detail views — not used to hide rows. */
  likelyTestDemo?: boolean;
  exclusionReason?: string | null;
};

export type AdminTierMix = {
  cub: number;
  grizzly: number;
  kodiak: number;
  other: number;
};

export type AdminHomeContaminationMetrics = {
  companies: AdminContaminationCountMeta;
  companyMembers: AdminContaminationCountMeta;
  quoteRequests: AdminContaminationCountMeta;
  quoteRequestsLinked: AdminContaminationCountMeta;
  opportunities: AdminContaminationCountMeta;
  activeProducts: AdminContaminationCountMeta;
  draftProducts: AdminContaminationCountMeta;
  canonicalOrders: AdminContaminationCountMeta;
};

export type AdminHomeContaminationSummary = {
  metrics: AdminHomeContaminationMetrics;
  /** Rows removed from KPI card trusted counts. */
  kpiExcludedTotal: number;
  /** Definite/high flagged rows (aligns with strict contamination report). */
  flaggedVisibleTotal: number;
  /** Banner display total — same as flaggedVisibleTotal. */
  excludedTotal: number;
  partialScan: boolean;
};

export type AdminHomeSnapshot = {
  configured: boolean;
  catalog: Awaited<ReturnType<typeof fetchCatalogHealth>>;
  /** Trusted (contamination-excluded) counts for KPI cards. */
  quoteRequestCount: number | null;
  quoteRequestsLinkedCount: number | null;
  opportunityCount: number | null;
  activeProductCount: number | null;
  draftProductCount: number | null;
  totalVariantActiveCount: number | null;
  companiesCount: number | null;
  companyMembersCount: number | null;
  canonicalOrdersCount: number | null;
  tierMix: AdminTierMix;
  recentQuoteRequests: AdminRecentQuoteRow[];
  contamination: AdminHomeContaminationSummary;
};

async function headCount(
  supabase: any,
  run: () => Promise<{ count: number | null; error: { message: string } | null }>
): Promise<number | null> {
  try {
    const { count, error } = await run();
    if (error) return null;
    return count;
  } catch {
    return null;
  }
}

function emptyTierMix(): AdminTierMix {
  return { cub: 0, grizzly: 0, kodiak: 0, other: 0 };
}

function emptyContaminationMetrics(): AdminHomeContaminationMetrics {
  const empty: AdminContaminationCountMeta = {
    total_count: null,
    trusted_count: null,
    excluded_test_count: null,
    scan_complete: false,
  };
  return {
    companies: { ...empty },
    companyMembers: { ...empty },
    quoteRequests: { ...empty },
    quoteRequestsLinked: { ...empty },
    opportunities: { ...empty },
    activeProducts: { ...empty },
    draftProducts: { ...empty },
    canonicalOrders: { ...empty },
  };
}

function trustedFromMeta(meta: AdminContaminationCountMeta): number | null {
  return meta.trusted_count;
}

function tierFromCompany(row: { b2b_pricing_tier_code?: string | null }): keyof AdminTierMix {
  const t = String(row.b2b_pricing_tier_code ?? "").toLowerCase();
  if (t === "cub") return "cub";
  if (t === "grizzly") return "grizzly";
  if (t === "kodiak") return "kodiak";
  return "other";
}

async function fetchCompaniesForKpi(supabase: any): Promise<Record<string, unknown>[]> {
  try {
    const { data, error } = await supabase
      .schema("gc_commerce")
      .from("companies")
      .select("id, trade_name, legal_name, slug, b2b_pricing_tier_code")
      .limit(KPI_SCAN_LIMIT);
    if (error || !data) return [];
    return data as Record<string, unknown>[];
  } catch {
    return [];
  }
}

async function fetchQuoteRequestsForKpi(supabase: any): Promise<Record<string, unknown>[]> {
  try {
    const { data, error } = await supabase
      .schema("catalogos")
      .from("quote_requests")
      .select("id, email, company_name, contact_name, notes, gc_company_id")
      .limit(KPI_SCAN_LIMIT);
    if (error || !data) return [];
    return data as Record<string, unknown>[];
  } catch {
    return [];
  }
}

async function fetchOpportunitiesForKpi(supabase: any): Promise<Record<string, unknown>[]> {
  try {
    const { data, error } = await supabase
      .from("procurement_opportunities")
      .select("id, company_name, contact_name, contact_email, metadata")
      .limit(KPI_SCAN_LIMIT);
    if (error || !data) return [];
    return data as Record<string, unknown>[];
  } catch {
    return [];
  }
}

async function fetchCatalogProductsForKpi(supabase: any, status: "active" | "draft"): Promise<Record<string, unknown>[]> {
  try {
    const { data, error } = await supabase
      .schema("catalog_v2")
      .from("catalog_products")
      .select("id, slug, name, catalog_product_types(code)")
      .eq("status", status)
      .limit(KPI_SCAN_LIMIT);
    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map((row) => {
      const types = row.catalog_product_types as { code?: string } | { code?: string }[] | null;
      const typeCode = Array.isArray(types) ? types[0]?.code : types?.code;
      return { ...row, product_type_code: typeCode ?? null };
    });
  } catch {
    return [];
  }
}

async function fetchCompanyMembersForKpi(supabase: any): Promise<Record<string, unknown>[]> {
  try {
    const { data: members, error } = await supabase
      .schema("gc_commerce")
      .from("company_members")
      .select("company_id, user_id")
      .limit(KPI_SCAN_LIMIT);
    if (error || !members?.length) return [];

    const userIds = [...new Set((members as { user_id?: string }[]).map((m) => m.user_id).filter(Boolean))] as string[];
    if (userIds.length === 0) return members as Record<string, unknown>[];

    const { data: users } = await supabase.from("users").select("id, email, company_name").in("id", userIds);
    const userById = new Map((users as { id: string; email?: string; company_name?: string }[] | null)?.map((u) => [u.id, u]) ?? []);

    return (members as { company_id: string; user_id: string }[]).map((m) => {
      const u = userById.get(m.user_id);
      return { ...m, email: u?.email ?? null, company_name: u?.company_name ?? null };
    });
  } catch {
    return [];
  }
}

async function fetchOrdersForKpi(supabase: any): Promise<Record<string, unknown>[]> {
  try {
    const { data, error } = await supabase
      .schema("gc_commerce")
      .from("orders")
      .select(
        "id, order_number, metadata, stripe_payment_intent_id, payment_confirmed_at, payment_method, invoice_status, invoice_amount_paid, total_minor, companies(trade_name, legal_name, slug)"
      )
      .limit(KPI_SCAN_LIMIT);
    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map((row) => {
      const co = row.companies as { trade_name?: string; legal_name?: string; slug?: string } | { trade_name?: string; legal_name?: string; slug?: string }[] | null;
      const company = Array.isArray(co) ? co[0] : co;
      return {
        ...row,
        trade_name: company?.trade_name ?? null,
        legal_name: company?.legal_name ?? null,
        company_slug: company?.slug ?? null,
      };
    });
  } catch {
    return [];
  }
}

async function fetchSuppliersForKpi(supabase: any): Promise<Record<string, unknown>[]> {
  try {
    const { data, error } = await supabase
      .schema("catalogos")
      .from("suppliers")
      .select("id, slug, name")
      .limit(KPI_SCAN_LIMIT);
    if (error || !data) return [];
    return data as Record<string, unknown>[];
  } catch {
    return [];
  }
}

function buildTierMixFromCompanies(companies: Record<string, unknown>[]): AdminTierMix {
  const mix = emptyTierMix();
  for (const row of companies) {
    if (shouldExcludeFromAdminKpi(row, "company")) continue;
    mix[tierFromCompany(row as { b2b_pricing_tier_code?: string | null })] += 1;
  }
  return mix;
}

function buildContaminationSummary(
  headCounts: {
    companies: number | null;
    companyMembers: number | null;
    quoteRequests: number | null;
    quoteRequestsLinked: number | null;
    opportunities: number | null;
    activeProducts: number | null;
    draftProducts: number | null;
    canonicalOrders: number | null;
  },
  rows: {
    companies: Record<string, unknown>[];
    companyMembers: Record<string, unknown>[];
    quoteRequests: Record<string, unknown>[];
    opportunities: Record<string, unknown>[];
    activeProducts: Record<string, unknown>[];
    draftProducts: Record<string, unknown>[];
    orders: Record<string, unknown>[];
    suppliers: Record<string, unknown>[];
  }
): AdminHomeContaminationSummary {
  const linkedQuoteRows = rows.quoteRequests.filter((r) => r.gc_company_id != null);

  const metrics: AdminHomeContaminationMetrics = {
    companies: buildAdminContaminationCountMeta(rows.companies, "company", headCounts.companies),
    companyMembers: buildAdminContaminationCountMeta(rows.companyMembers, "user", headCounts.companyMembers),
    quoteRequests: buildAdminContaminationCountMeta(rows.quoteRequests, "quote_request", headCounts.quoteRequests),
    quoteRequestsLinked: buildAdminContaminationCountMeta(linkedQuoteRows, "quote_request", headCounts.quoteRequestsLinked),
    opportunities: buildAdminContaminationCountMeta(rows.opportunities, "quote_request", headCounts.opportunities),
    activeProducts: buildAdminContaminationCountMeta(rows.activeProducts, "catalog_product", headCounts.activeProducts),
    draftProducts: buildAdminContaminationCountMeta(rows.draftProducts, "catalog_product", headCounts.draftProducts),
    canonicalOrders: buildAdminContaminationCountMeta(rows.orders, "order", headCounts.canonicalOrders),
  };

  const kpiExcludedTotal = sumExcludedFromMetrics(
    metrics.companies,
    metrics.companyMembers,
    metrics.quoteRequests,
    metrics.quoteRequestsLinked,
    metrics.opportunities,
    metrics.activeProducts,
    metrics.draftProducts,
    metrics.canonicalOrders
  );

  const flaggedVisibleTotal = sumFlaggedVisibleFromRows([
    { rows: rows.companies, entityType: "company" },
    { rows: rows.companyMembers, entityType: "user" },
    { rows: rows.quoteRequests, entityType: "quote_request" },
    { rows: rows.opportunities, entityType: "quote_request" },
    { rows: rows.activeProducts, entityType: "catalog_product" },
    { rows: rows.draftProducts, entityType: "catalog_product" },
    { rows: rows.orders, entityType: "order" },
    { rows: rows.suppliers, entityType: "supplier" },
  ]);

  return {
    metrics,
    kpiExcludedTotal,
    flaggedVisibleTotal,
    excludedTotal: flaggedVisibleTotal,
    partialScan: anyPartialContaminationScan(
      metrics.companies,
      metrics.companyMembers,
      metrics.quoteRequests,
      metrics.opportunities,
      metrics.activeProducts,
      metrics.draftProducts,
      metrics.canonicalOrders
    ),
  };
}

async function fetchRecentQuotes(supabase: any, limit: number): Promise<AdminRecentQuoteRow[]> {
  try {
    const { data, error } = await supabase
      .schema("catalogos")
      .from("quote_requests")
      .select("id, status, company_name, contact_name, email, created_at, submitted_at, gc_company_id")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return (data as AdminRecentQuoteRow[]).map((q) => {
      const row = q as Record<string, unknown>;
      const likelyTestDemo = isLikelyTestData(row, "quote_request");
      return {
        ...q,
        likelyTestDemo,
        exclusionReason: likelyTestDemo ? getContaminationExclusionReason(row, "quote_request") : null,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Read-only counts for the admin dashboard. Failures degrade to null (shown as n/a).
 * Summary KPI values exclude likely test/demo/smoke rows; see `contamination` for metadata.
 */
export async function fetchAdminHomeSnapshot(): Promise<AdminHomeSnapshot> {
  const catalog = await fetchCatalogHealth();
  const emptyContamination = (): AdminHomeContaminationSummary => ({
    metrics: emptyContaminationMetrics(),
    kpiExcludedTotal: 0,
    flaggedVisibleTotal: 0,
    excludedTotal: 0,
    partialScan: false,
  });

  const emptySnap = (configured: boolean): AdminHomeSnapshot => ({
    configured,
    catalog,
    quoteRequestCount: null,
    quoteRequestsLinkedCount: null,
    opportunityCount: null,
    activeProductCount: null,
    draftProductCount: null,
    totalVariantActiveCount: null,
    companiesCount: null,
    companyMembersCount: null,
    canonicalOrdersCount: null,
    tierMix: emptyTierMix(),
    recentQuoteRequests: [],
    contamination: emptyContamination(),
  });

  if (!isSupabaseConfigured()) {
    return emptySnap(false);
  }

  const supabase = getSupabaseAdmin() as any;

  const [
    quoteRequestHead,
    quoteRequestsLinkedHead,
    opportunityHead,
    activeProductHead,
    draftProductHead,
    totalVariantActiveCount,
    companiesHead,
    companyMembersHead,
    canonicalOrdersHead,
    companyRows,
    quoteRows,
    opportunityRows,
    activeProductRows,
    draftProductRows,
    memberRows,
    orderRows,
    supplierRows,
    recentQuoteRequests,
  ] = await Promise.all([
    headCount(supabase, () =>
      supabase.schema("catalogos").from("quote_requests").select("id", { count: "exact", head: true })
    ),
    headCount(supabase, () =>
      supabase
        .schema("catalogos")
        .from("quote_requests")
        .select("id", { count: "exact", head: true })
        .not("gc_company_id", "is", null)
    ),
    headCount(supabase, () => supabase.from("procurement_opportunities").select("id", { count: "exact", head: true })),
    headCount(supabase, () =>
      supabase.schema("catalog_v2").from("catalog_products").select("id", { count: "exact", head: true }).eq("status", "active")
    ),
    headCount(supabase, () =>
      supabase.schema("catalog_v2").from("catalog_products").select("id", { count: "exact", head: true }).eq("status", "draft")
    ),
    headCount(supabase, () =>
      supabase.schema("catalog_v2").from("catalog_variants").select("id", { count: "exact", head: true }).eq("is_active", true)
    ),
    headCount(supabase, () => supabase.schema("gc_commerce").from("companies").select("id", { count: "exact", head: true })),
    headCount(supabase, () =>
      supabase.schema("gc_commerce").from("company_members").select("company_id", { count: "exact", head: true })
    ),
    headCount(supabase, () =>
      supabase.schema("gc_commerce").from("orders").select("id", { count: "exact", head: true })
    ),
    fetchCompaniesForKpi(supabase),
    fetchQuoteRequestsForKpi(supabase),
    fetchOpportunitiesForKpi(supabase),
    fetchCatalogProductsForKpi(supabase, "active"),
    fetchCatalogProductsForKpi(supabase, "draft"),
    fetchCompanyMembersForKpi(supabase),
    fetchOrdersForKpi(supabase),
    fetchSuppliersForKpi(supabase),
    fetchRecentQuotes(supabase, 10),
  ]);

  const contamination = buildContaminationSummary(
    {
      companies: companiesHead,
      companyMembers: companyMembersHead,
      quoteRequests: quoteRequestHead,
      quoteRequestsLinked: quoteRequestsLinkedHead,
      opportunities: opportunityHead,
      activeProducts: activeProductHead,
      draftProducts: draftProductHead,
      canonicalOrders: canonicalOrdersHead,
    },
    {
      companies: companyRows,
      companyMembers: memberRows,
      quoteRequests: quoteRows,
      opportunities: opportunityRows,
      activeProducts: activeProductRows,
      draftProducts: draftProductRows,
      orders: orderRows,
      suppliers: supplierRows,
    }
  );

  const { metrics } = contamination;

  return {
    configured: true,
    catalog,
    quoteRequestCount: trustedFromMeta(metrics.quoteRequests),
    quoteRequestsLinkedCount: trustedFromMeta(metrics.quoteRequestsLinked),
    opportunityCount: trustedFromMeta(metrics.opportunities),
    activeProductCount: trustedFromMeta(metrics.activeProducts),
    draftProductCount: trustedFromMeta(metrics.draftProducts),
    totalVariantActiveCount,
    companiesCount: trustedFromMeta(metrics.companies),
    companyMembersCount: trustedFromMeta(metrics.companyMembers),
    canonicalOrdersCount: trustedFromMeta(metrics.canonicalOrders),
    tierMix: buildTierMixFromCompanies(companyRows),
    recentQuoteRequests,
    contamination,
  };
}

/** Exported for tests — classify rows for a given admin entity type. */
export function classifyRowsForAdminKpi(rows: Record<string, unknown>[], entityType: ContaminationEntityType) {
  return buildAdminContaminationCountMeta(rows, entityType, rows.length);
}
