-- =============================================================================
-- URL Import: admin-controlled manufacturer/distributor URL crawl and import.
-- Jobs, pages, extracted products; bridge to import_batches when approved.
-- =============================================================================

-- url_import_jobs: one per admin crawl request
CREATE TABLE IF NOT EXISTS catalogos.url_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES catalogos.suppliers(id) ON DELETE RESTRICT,
  supplier_name TEXT NOT NULL,
  start_url TEXT NOT NULL,
  allowed_domain TEXT NOT NULL,
  crawl_mode TEXT NOT NULL DEFAULT 'category' CHECK (crawl_mode IN ('single_product', 'category')),
  max_pages INT NOT NULL DEFAULT 50 CHECK (max_pages >= 1 AND max_pages <= 500),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  pages_discovered INT NOT NULL DEFAULT 0,
  pages_crawled INT NOT NULL DEFAULT 0,
  pages_skipped_unchanged INT NOT NULL DEFAULT 0,
  product_pages_detected INT NOT NULL DEFAULT 0,
  products_extracted INT NOT NULL DEFAULT 0,
  ai_extractions_used INT NOT NULL DEFAULT 0,
  family_groups_inferred INT NOT NULL DEFAULT 0,
  variants_inferred INT NOT NULL DEFAULT 0,
  failed_pages_count INT NOT NULL DEFAULT 0,
  warnings TEXT[] DEFAULT '{}',
  import_batch_id UUID REFERENCES catalogos.import_batches(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_url_import_jobs_status ON catalogos.url_import_jobs (status);
CREATE INDEX IF NOT EXISTS idx_url_import_jobs_created ON catalogos.url_import_jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_url_import_jobs_supplier ON catalogos.url_import_jobs (supplier_id);

COMMENT ON TABLE catalogos.url_import_jobs IS 'Admin URL import: one job per crawl; bridges to import_batch when approved.';

-- url_import_pages: discovered and crawled URLs per job
CREATE TABLE IF NOT EXISTS catalogos.url_import_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES catalogos.url_import_jobs(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  page_type TEXT NOT NULL DEFAULT 'unknown' CHECK (page_type IN ('product', 'category', 'other')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'crawled', 'failed', 'skipped')),
  content_hash TEXT,
  raw_html_length INT,
  extracted_snapshot JSONB,
  error_message TEXT,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  crawled_at TIMESTAMPTZ,
  UNIQUE (job_id, url)
);

CREATE INDEX IF NOT EXISTS idx_url_import_pages_job ON catalogos.url_import_pages (job_id);
CREATE INDEX IF NOT EXISTS idx_url_import_pages_status ON catalogos.url_import_pages (status);
CREATE INDEX IF NOT EXISTS idx_url_import_pages_type ON catalogos.url_import_pages (page_type);
CREATE INDEX IF NOT EXISTS idx_url_import_pages_content_hash ON catalogos.url_import_pages (job_id, content_hash) WHERE content_hash IS NOT NULL;

COMMENT ON TABLE catalogos.url_import_pages IS 'Crawled URLs per URL import job; content_hash for skip-unchanged.';

-- url_import_products: extracted product rows per job (before bridge to import pipeline)
CREATE TABLE IF NOT EXISTS catalogos.url_import_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES catalogos.url_import_jobs(id) ON DELETE CASCADE,
  page_id UUID NOT NULL REFERENCES catalogos.url_import_pages(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  normalized_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  extraction_method TEXT NOT NULL DEFAULT 'deterministic' CHECK (extraction_method IN ('deterministic', 'ai_fallback')),
  confidence NUMERIC(5,4) NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  ai_used BOOLEAN NOT NULL DEFAULT false,
  inferred_base_sku TEXT,
  inferred_size TEXT,
  family_group_key TEXT,
  grouping_confidence NUMERIC(5,4) CHECK (grouping_confidence IS NULL OR (grouping_confidence >= 0 AND grouping_confidence <= 1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_url_import_products_job ON catalogos.url_import_products (job_id);
CREATE INDEX IF NOT EXISTS idx_url_import_products_page ON catalogos.url_import_products (page_id);
CREATE INDEX IF NOT EXISTS idx_url_import_products_family_key ON catalogos.url_import_products (job_id, family_group_key) WHERE family_group_key IS NOT NULL;

COMMENT ON TABLE catalogos.url_import_products IS 'Extracted products from URL crawl; normalized_payload maps to ParsedRow for import bridge.';
