/**
 * Admin data for URL import: list jobs, get job detail with pages and products.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";

export interface UrlImportJobListItem {
  id: string;
  supplier_id: string;
  supplier_name: string;
  start_url: string;
  allowed_domain: string;
  crawl_mode: string;
  max_pages: number;
  status: string;
  pages_discovered: number;
  pages_crawled: number;
  pages_skipped_unchanged: number;
  product_pages_detected: number;
  products_extracted: number;
  ai_extractions_used: number;
  family_groups_inferred: number;
  variants_inferred: number;
  failed_pages_count: number;
  warnings: string[] | null;
  import_batch_id: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  created_by: string | null;
}

export async function listUrlImportJobs(limit = 50): Promise<UrlImportJobListItem[]> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .from("url_import_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as UrlImportJobListItem[];
}

export interface UrlImportPageRow {
  id: string;
  url: string;
  page_type: string;
  status: string;
  content_hash: string | null;
  error_message: string | null;
  crawled_at: string | null;
}

export interface UrlImportProductRow {
  id: string;
  source_url: string;
  normalized_payload: Record<string, unknown>;
  extraction_method: string;
  confidence: number;
  ai_used: boolean;
  inferred_base_sku: string | null;
  inferred_size: string | null;
  family_group_key: string | null;
  grouping_confidence: number | null;
}

export interface UrlImportJobDetail {
  job: UrlImportJobListItem;
  pages: UrlImportPageRow[];
  products: UrlImportProductRow[];
  /** Grouped by family_group_key for preview. */
  familyGroups: Array<{ family_group_key: string; inferred_base_sku: string; count: number; products: UrlImportProductRow[] }>;
}

export async function getUrlImportJobDetail(jobId: string): Promise<UrlImportJobDetail | null> {
  const supabase = getSupabaseCatalogos(true);
  const { data: job, error: jobErr } = await supabase
    .from("url_import_jobs")
    .select("*")
    .eq("id", jobId)
    .single();
  if (jobErr || !job) return null;

  const { data: pages } = await supabase
    .from("url_import_pages")
    .select("id, url, page_type, status, content_hash, error_message, crawled_at")
    .eq("job_id", jobId)
    .order("discovered_at", { ascending: true });
  const { data: products } = await supabase
    .from("url_import_products")
    .select("id, source_url, normalized_payload, extraction_method, confidence, ai_used, inferred_base_sku, inferred_size, family_group_key, grouping_confidence")
    .eq("job_id", jobId);

  const productList = (products ?? []) as UrlImportProductRow[];
  const byKey = new Map<string, UrlImportProductRow[]>();
  for (const p of productList) {
    const key = p.family_group_key ?? "__ungrouped__";
    const list = byKey.get(key) ?? [];
    list.push(p);
    byKey.set(key, list);
  }
  const familyGroups: UrlImportJobDetail["familyGroups"] = [];
  for (const [key, list] of byKey) {
    if (key === "__ungrouped__") continue;
    const first = list[0];
    familyGroups.push({
      family_group_key: key,
      inferred_base_sku: first?.inferred_base_sku ?? "",
      count: list.length,
      products: list,
    });
  }

  return {
    job: job as UrlImportJobListItem,
    pages: (pages ?? []) as UrlImportPageRow[],
    products: productList,
    familyGroups,
  };
}
