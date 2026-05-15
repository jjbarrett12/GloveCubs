import { fetchCatalogHealth } from "@/lib/admin/catalog-health";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";

export type AdminCatalogOperationalCounts = {
  configured: boolean;
  catalog: Awaited<ReturnType<typeof fetchCatalogHealth>>;
  activeVariantCount: number | null;
};

/**
 * Single pass for admin Products workspace summary cards (catalog health + active variant head count).
 */
export async function fetchAdminCatalogOperationalCounts(): Promise<AdminCatalogOperationalCounts> {
  const catalog = await fetchCatalogHealth();
  if (!isSupabaseConfigured()) {
    return { configured: false, catalog, activeVariantCount: null };
  }
  const supabase = getSupabaseAdmin() as any;
  try {
    const { count, error } = await supabase
      .schema("catalog_v2")
      .from("catalog_variants")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);
    if (error) return { configured: true, catalog, activeVariantCount: null };
    return { configured: true, catalog, activeVariantCount: count ?? 0 };
  } catch {
    return { configured: true, catalog, activeVariantCount: null };
  }
}
