/**
 * Admin data: list sources, jobs, job detail, staging by job, failed pages.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";

export interface DistributorSourceForAdmin {
  id: string;
  name: string;
  root_url: string;
  last_crawled_at: string | null;
  status: string;
}

export async function listDistributorSources(): Promise<DistributorSourceForAdmin[]> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .from("distributor_sources")
    .select("id, name, root_url, last_crawled_at, status")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as DistributorSourceForAdmin[];
}

export interface CrawlJobForAdmin {
  id: string;
  distributor_source_id: string;
  distributor_name: string;
  start_url: string;
  status: string;
  pages_discovered: number;
  product_pages_discovered: number;
  products_extracted: number;
  errors_count: number;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  new_products: number;
  updated_products: number;
  missing_products: number;
}

export async function listCrawlJobs(limit = 50): Promise<CrawlJobForAdmin[]> {
  const supabase = getSupabaseCatalogos(true);
  const { data: jobs, error: jobsErr } = await supabase
    .from("distributor_crawl_jobs")
    .select("id, distributor_source_id, start_url, status, pages_discovered, product_pages_discovered, products_extracted, errors_count, started_at, finished_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (jobsErr) throw new Error(jobsErr.message);
  const list = (jobs ?? []) as Array<{
    id: string;
    distributor_source_id: string;
    start_url: string;
    status: string;
    pages_discovered: number;
    product_pages_discovered: number;
    products_extracted: number;
    errors_count: number;
    started_at: string | null;
    finished_at: string | null;
    created_at: string;
  }>;
  if (list.length === 0) return [];
  const sourceIds = [...new Set(list.map((j) => j.distributor_source_id))];
  const { data: sources } = await supabase
    .from("distributor_sources")
    .select("id, name")
    .in("id", sourceIds);
  const nameById = new Map(
    (sources ?? []).map((s: { id: string; name: string }) => [s.id, s.name])
  );
  const jobIds = list.map((j) => j.id);
  const { data: changes } = await supabase
    .from("distributor_product_changes")
    .select("crawl_job_id, change_type")
    .in("crawl_job_id", jobIds);
  const changeCounts = new Map<string, { new: number; updated: number; missing: number }>();
  for (const jid of jobIds) {
    changeCounts.set(jid, { new: 0, updated: 0, missing: 0 });
  }
  for (const c of changes ?? []) {
    const row = c as { crawl_job_id: string; change_type: string };
    const cur = changeCounts.get(row.crawl_job_id);
    if (!cur) continue;
    if (row.change_type === "new_product") cur.new++;
    else if (row.change_type === "updated_product") cur.updated++;
    else if (row.change_type === "missing_product") cur.missing++;
  }
  return list.map((j) => {
    const counts = changeCounts.get(j.id) ?? { new: 0, updated: 0, missing: 0 };
    return {
      ...j,
      distributor_name: nameById.get(j.distributor_source_id) ?? "—",
      new_products: counts.new,
      updated_products: counts.updated,
      missing_products: counts.missing,
    };
  });
}

export interface StagingRowForAdmin {
  id: string;
  crawl_job_id: string;
  source_url: string;
  supplier_sku: string | null;
  product_name: string | null;
  brand: string | null;
  status: string;
  raw_payload: Record<string, unknown>;
  normalized_payload: Record<string, unknown>;
  created_at: string;
}

export async function listStagingByJob(jobId: string): Promise<StagingRowForAdmin[]> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .from("distributor_product_staging")
    .select("id, crawl_job_id, source_url, supplier_sku, product_name, brand, status, raw_payload, normalized_payload, created_at")
    .eq("crawl_job_id", jobId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as StagingRowForAdmin[];
}

export interface FailedPageForAdmin {
  id: string;
  url: string;
  status: string;
}

export async function listFailedPagesByJob(jobId: string): Promise<FailedPageForAdmin[]> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .from("distributor_crawl_pages")
    .select("id, url, status")
    .eq("crawl_job_id", jobId)
    .eq("status", "failed");
  if (error) throw new Error(error.message);
  return (data ?? []) as FailedPageForAdmin[];
}

export interface CrawlJobDetail {
  job: CrawlJobForAdmin;
  staging: StagingRowForAdmin[];
  failedPages: FailedPageForAdmin[];
}

export async function getCrawlJobDetail(jobId: string): Promise<CrawlJobDetail | null> {
  const supabase = getSupabaseCatalogos(true);
  const { data: jobRow, error: jobErr } = await supabase
    .from("distributor_crawl_jobs")
    .select("id, distributor_source_id, start_url, status, pages_discovered, product_pages_discovered, products_extracted, errors_count, started_at, finished_at, created_at")
    .eq("id", jobId)
    .single();
  if (jobErr || !jobRow) return null;
  const j = jobRow as {
    id: string;
    distributor_source_id: string;
    start_url: string;
    status: string;
    pages_discovered: number;
    product_pages_discovered: number;
    products_extracted: number;
    errors_count: number;
    started_at: string | null;
    finished_at: string | null;
    created_at: string;
  };
  const { data: sourceRow } = await supabase
    .from("distributor_sources")
    .select("name")
    .eq("id", j.distributor_source_id)
    .single();
  const distributor_name = (sourceRow as { name?: string } | null)?.name ?? "—";
  const { data: changeRows } = await supabase
    .from("distributor_product_changes")
    .select("change_type")
    .eq("crawl_job_id", jobId);
  const changes = (changeRows ?? []) as { change_type: string }[];
  const new_products = changes.filter((c) => c.change_type === "new_product").length;
  const updated_products = changes.filter((c) => c.change_type === "updated_product").length;
  const missing_products = changes.filter((c) => c.change_type === "missing_product").length;
  const job: CrawlJobForAdmin = {
    ...j,
    distributor_name,
    new_products,
    updated_products,
    missing_products,
  };
  const [staging, failedPages] = await Promise.all([
    listStagingByJob(jobId),
    listFailedPagesByJob(jobId),
  ]);
  return { job, staging, failedPages };
}

export async function updateDistributorStagingStatus(
  id: string,
  status: "approved" | "rejected"
): Promise<void> {
  const supabase = getSupabaseCatalogos(true);
  const { error } = await supabase
    .from("distributor_product_staging")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateDistributorSourceStatus(
  id: string,
  status: "active" | "paused" | "archived"
): Promise<void> {
  const supabase = getSupabaseCatalogos(true);
  const { error } = await supabase
    .from("distributor_sources")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
