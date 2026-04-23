/**
 * CatalogOS supplier feeds — exact schema: catalogos.supplier_feeds.
 * feed_type: url | csv | api; config holds url/csv_url/feed_url for URL feeds.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";

export type FeedType = "url" | "csv" | "api";

export interface SupplierFeedRow {
  id: string;
  supplier_id: string;
  feed_type: FeedType;
  config: Record<string, unknown>;
  schedule_cron: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateFeedInput {
  supplier_id: string;
  feed_type: FeedType;
  config: Record<string, unknown>;
  schedule_cron?: string | null;
  is_active?: boolean;
}

export async function listFeeds(): Promise<SupplierFeedRow[]> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .from("supplier_feeds")
    .select("id, supplier_id, feed_type, config, schedule_cron, is_active, created_at, updated_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SupplierFeedRow[];
}

export async function listFeedsBySupplier(supplierId: string): Promise<SupplierFeedRow[]> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .from("supplier_feeds")
    .select("id, supplier_id, feed_type, config, schedule_cron, is_active, created_at, updated_at")
    .eq("supplier_id", supplierId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SupplierFeedRow[];
}

export async function getFeedById(id: string): Promise<SupplierFeedRow | null> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase.from("supplier_feeds").select("*").eq("id", id).single();
  if (error || !data) return null;
  return data as SupplierFeedRow;
}

/**
 * Resolve feed URL from config (config.url, config.csv_url, or config.feed_url).
 */
export function getFeedUrl(feed: SupplierFeedRow): string | null {
  const c = feed.config ?? {};
  const url = (c.url ?? c.csv_url ?? c.feed_url) as string | undefined;
  return url && typeof url === "string" ? url : null;
}

export async function createFeed(input: CreateFeedInput): Promise<{ id: string }> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .from("supplier_feeds")
    .insert({
      supplier_id: input.supplier_id,
      feed_type: input.feed_type,
      config: input.config ?? {},
      schedule_cron: input.schedule_cron ?? null,
      is_active: input.is_active ?? true,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("Feed created but no id returned");
  return { id: data.id as string };
}
