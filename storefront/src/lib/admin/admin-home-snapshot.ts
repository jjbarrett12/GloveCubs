import { fetchCatalogHealth } from "@/lib/admin/catalog-health";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";

export type AdminRecentQuoteRow = {
  id: string;
  status: string;
  company_name: string | null;
  contact_name: string | null;
  created_at: string;
  submitted_at: string | null;
  gc_company_id: string | null;
};

export type AdminTierMix = {
  cub: number;
  grizzly: number;
  kodiak: number;
  other: number;
};

export type AdminHomeSnapshot = {
  configured: boolean;
  catalog: Awaited<ReturnType<typeof fetchCatalogHealth>>;
  quoteRequestCount: number | null;
  /** Rows with gc_company_id set (signed-in buyer linkage). */
  quoteRequestsLinkedCount: number | null;
  opportunityCount: number | null;
  activeProductCount: number | null;
  draftProductCount: number | null;
  totalVariantActiveCount: number | null;
  companiesCount: number | null;
  companyMembersCount: number | null;
  /** Rows in gc_commerce.orders — row count only; not monetary sales KPIs. */
  canonicalOrdersCount: number | null;
  tierMix: AdminTierMix;
  recentQuoteRequests: AdminRecentQuoteRow[];
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

async function fetchTierMix(supabase: any): Promise<AdminTierMix> {
  const mix = emptyTierMix();
  try {
    const { data, error } = await supabase
      .schema("gc_commerce")
      .from("companies")
      .select("b2b_pricing_tier_code")
      .limit(5000);
    if (error || !data) return mix;
    for (const row of data as { b2b_pricing_tier_code?: string | null }[]) {
      const t = String(row.b2b_pricing_tier_code ?? "").toLowerCase();
      if (t === "cub") mix.cub += 1;
      else if (t === "grizzly") mix.grizzly += 1;
      else if (t === "kodiak") mix.kodiak += 1;
      else mix.other += 1;
    }
  } catch {
    return mix;
  }
  return mix;
}

async function fetchRecentQuotes(supabase: any, limit: number): Promise<AdminRecentQuoteRow[]> {
  try {
    const { data, error } = await supabase
      .schema("catalogos")
      .from("quote_requests")
      .select("id, status, company_name, contact_name, created_at, submitted_at, gc_company_id")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data as AdminRecentQuoteRow[];
  } catch {
    return [];
  }
}

/**
 * Read-only counts for the admin dashboard. Failures degrade to null (shown as n/a).
 */
export async function fetchAdminHomeSnapshot(): Promise<AdminHomeSnapshot> {
  const catalog = await fetchCatalogHealth();
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
  });

  if (!isSupabaseConfigured()) {
    return emptySnap(false);
  }

  const supabase = getSupabaseAdmin() as any;

  const [
    quoteRequestCount,
    quoteRequestsLinkedCount,
    opportunityCount,
    activeProductCount,
    draftProductCount,
    totalVariantActiveCount,
    companiesCount,
    companyMembersCount,
    canonicalOrdersCount,
    tierMix,
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
    fetchTierMix(supabase),
    fetchRecentQuotes(supabase, 10),
  ]);

  return {
    configured: true,
    catalog,
    quoteRequestCount,
    quoteRequestsLinkedCount,
    opportunityCount,
    activeProductCount,
    draftProductCount,
    totalVariantActiveCount,
    companiesCount,
    companyMembersCount,
    canonicalOrdersCount,
    tierMix,
    recentQuoteRequests,
  };
}
