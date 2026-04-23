-- =============================================================================
-- Distributor sync: sources, crawl jobs, pages, product staging, changes.
-- Schema: catalogos. Admin-only; crawl restricted to allowed domains/paths.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- distributor_sources
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalogos.distributor_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  root_url TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'website',
  allowed_domains TEXT[] NOT NULL DEFAULT '{}',
  allowed_path_patterns TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  crawl_frequency TEXT,
  last_crawled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_distributor_sources_status ON catalogos.distributor_sources (status);
CREATE INDEX IF NOT EXISTS idx_distributor_sources_root_url ON catalogos.distributor_sources (root_url);

COMMENT ON TABLE catalogos.distributor_sources IS 'Approved distributor sources; crawl restricted to allowed_domains and allowed_path_patterns.';

-- -----------------------------------------------------------------------------
-- distributor_crawl_jobs
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalogos.distributor_crawl_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_source_id UUID NOT NULL REFERENCES catalogos.distributor_sources(id) ON DELETE CASCADE,
  start_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  pages_discovered INT NOT NULL DEFAULT 0,
  product_pages_discovered INT NOT NULL DEFAULT 0,
  products_extracted INT NOT NULL DEFAULT 0,
  errors_count INT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_distributor_crawl_jobs_source ON catalogos.distributor_crawl_jobs (distributor_source_id);
CREATE INDEX IF NOT EXISTS idx_distributor_crawl_jobs_status ON catalogos.distributor_crawl_jobs (status);
CREATE INDEX IF NOT EXISTS idx_distributor_crawl_jobs_created ON catalogos.distributor_crawl_jobs (created_at DESC);

COMMENT ON TABLE catalogos.distributor_crawl_jobs IS 'Single crawl run for a distributor source; tracks discovered pages and extracted products.';

-- -----------------------------------------------------------------------------
-- distributor_crawl_pages
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalogos.distributor_crawl_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crawl_job_id UUID NOT NULL REFERENCES catalogos.distributor_crawl_jobs(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  page_type TEXT NOT NULL DEFAULT 'unknown' CHECK (page_type IN ('category', 'product', 'unknown')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'crawled', 'failed', 'skipped')),
  raw_html_storage_path TEXT,
  extracted_snapshot JSONB,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  crawled_at TIMESTAMPTZ,
  UNIQUE (crawl_job_id, url)
);

CREATE INDEX IF NOT EXISTS idx_distributor_crawl_pages_job ON catalogos.distributor_crawl_pages (crawl_job_id);
CREATE INDEX IF NOT EXISTS idx_distributor_crawl_pages_status ON catalogos.distributor_crawl_pages (status);
CREATE INDEX IF NOT EXISTS idx_distributor_crawl_pages_type ON catalogos.distributor_crawl_pages (page_type);

COMMENT ON TABLE catalogos.distributor_crawl_pages IS 'URLs discovered and crawled per job; stores path to HTML or extracted snapshot.';

-- -----------------------------------------------------------------------------
-- distributor_product_staging
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalogos.distributor_product_staging (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crawl_job_id UUID NOT NULL REFERENCES catalogos.distributor_crawl_jobs(id) ON DELETE CASCADE,
  distributor_source_id UUID NOT NULL REFERENCES catalogos.distributor_sources(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  supplier_sku TEXT,
  manufacturer_sku TEXT,
  product_name TEXT,
  brand TEXT,
  description TEXT,
  material TEXT,
  thickness_mil TEXT,
  color TEXT,
  size TEXT,
  powder_free BOOLEAN,
  grade TEXT,
  gloves_per_box INT,
  boxes_per_case INT,
  case_price NUMERIC,
  image_urls TEXT[] DEFAULT '{}',
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  normalized_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  fingerprint TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'published', 'duplicate')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_distributor_product_staging_job ON catalogos.distributor_product_staging (crawl_job_id);
CREATE INDEX IF NOT EXISTS idx_distributor_product_staging_source ON catalogos.distributor_product_staging (distributor_source_id);
CREATE INDEX IF NOT EXISTS idx_distributor_product_staging_sku ON catalogos.distributor_product_staging (distributor_source_id, supplier_sku);
CREATE INDEX IF NOT EXISTS idx_distributor_product_staging_fingerprint ON catalogos.distributor_product_staging (fingerprint);
CREATE INDEX IF NOT EXISTS idx_distributor_product_staging_status ON catalogos.distributor_product_staging (status);

COMMENT ON TABLE catalogos.distributor_product_staging IS 'Extracted and normalized product rows per crawl; staged for review and publish.';

-- -----------------------------------------------------------------------------
-- distributor_product_changes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalogos.distributor_product_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_source_id UUID NOT NULL REFERENCES catalogos.distributor_sources(id) ON DELETE CASCADE,
  crawl_job_id UUID NOT NULL REFERENCES catalogos.distributor_crawl_jobs(id) ON DELETE CASCADE,
  change_type TEXT NOT NULL CHECK (change_type IN ('new_product', 'updated_product', 'missing_product', 'extraction_failed', 'duplicate_candidate')),
  related_product_id UUID,
  related_offer_id UUID,
  source_url TEXT,
  summary TEXT,
  diff_payload JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_distributor_product_changes_source ON catalogos.distributor_product_changes (distributor_source_id);
CREATE INDEX IF NOT EXISTS idx_distributor_product_changes_job ON catalogos.distributor_product_changes (crawl_job_id);
CREATE INDEX IF NOT EXISTS idx_distributor_product_changes_type ON catalogos.distributor_product_changes (change_type);

COMMENT ON TABLE catalogos.distributor_product_changes IS 'Change records: new/updated/missing/failed/duplicate for review.';
