/**
 * Distributor sync: types for sources, crawl jobs, pages, staging, changes.
 */

export type DistributorSourceStatus = "active" | "paused" | "archived";
export type CrawlJobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
export type CrawlPageStatus = "pending" | "crawled" | "failed" | "skipped";
export type CrawlPageType = "category" | "product" | "unknown";
export type StagingStatus = "pending" | "approved" | "rejected" | "published" | "duplicate";
export type ChangeType = "new_product" | "updated_product" | "missing_product" | "extraction_failed" | "duplicate_candidate";

export interface DistributorSourceRow {
  id: string;
  name: string;
  root_url: string;
  source_type: string;
  allowed_domains: string[];
  allowed_path_patterns: string[];
  status: DistributorSourceStatus;
  crawl_frequency: string | null;
  last_crawled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrawlJobRow {
  id: string;
  distributor_source_id: string;
  start_url: string;
  status: CrawlJobStatus;
  pages_discovered: number;
  product_pages_discovered: number;
  products_extracted: number;
  errors_count: number;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface CrawlPageRow {
  id: string;
  crawl_job_id: string;
  url: string;
  page_type: CrawlPageType;
  status: CrawlPageStatus;
  raw_html_storage_path: string | null;
  extracted_snapshot: Record<string, unknown> | null;
  discovered_at: string;
  crawled_at: string | null;
}

export interface CreateCrawlInput {
  distributor_name: string;
  start_url: string;
  /** Optional: allowed domain (e.g. "safety-zone.com"). If set, start_url must be on this domain. */
  allowed_domain?: string;
  /** Optional: restrict paths (e.g. ["/gloves", "/category/disposable"]). Empty = allow same-origin. */
  allowed_path_patterns?: string[];
}

export interface CreateCrawlResult {
  jobId: string;
  sourceId: string;
  startUrl: string;
  pagesDiscovered: number;
  productPagesDiscovered: number;
  productsExtracted: number;
  errors: string[];
}
