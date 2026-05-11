import { fetchCatalogHealth } from "@/lib/admin/catalog-health";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";

export type AdminHomeSnapshot = {
  configured: boolean;
  catalog: Awaited<ReturnType<typeof fetchCatalogHealth>>;
  quoteRequestCount: number | null;
  opportunityCount: number | null;
  activeProductCount: number | null;
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

/**
 * Read-only counts for the admin dashboard. Failures degrade to null (shown as n/a).
 */
export async function fetchAdminHomeSnapshot(): Promise<AdminHomeSnapshot> {
  const catalog = await fetchCatalogHealth();
  if (!isSupabaseConfigured()) {
    return {
      configured: false,
      catalog,
      quoteRequestCount: null,
      opportunityCount: null,
      activeProductCount: null,
    };
  }

  const supabase = getSupabaseAdmin() as any;

  const [quoteRequestCount, opportunityCount, activeProductCount] = await Promise.all([
    headCount(supabase, () =>
      supabase.schema("catalogos").from("quote_requests").select("id", { count: "exact", head: true })
    ),
    headCount(supabase, () =>
      supabase.from("procurement_opportunities").select("id", { count: "exact", head: true })
    ),
    headCount(supabase, () =>
      supabase
        .schema("catalog_v2")
        .from("catalog_products")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
    ),
  ]);

  return {
    configured: true,
    catalog,
    quoteRequestCount,
    opportunityCount,
    activeProductCount,
  };
}
