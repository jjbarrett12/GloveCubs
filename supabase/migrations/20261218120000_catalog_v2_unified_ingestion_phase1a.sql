-- Phase 1A: unified ingestion authority (catalog_v2) — additive only.
-- Jobs, field evidence, fingerprints, lineage, blocked/awaiting_human states.

-- -----------------------------------------------------------------------------
-- ingestion_jobs — orchestration (distinct from catalogos.ingestion_jobs)
-- -----------------------------------------------------------------------------
CREATE TABLE catalog_v2.ingestion_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingestion_mode TEXT NOT NULL CHECK (ingestion_mode IN ('quick_draft', 'deep_supplier_crawl')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (
    status IN (
      'queued',
      'fetching',
      'extracting',
      'normalized',
      'review_ready',
      'publish_ready',
      'blocked',
      'awaiting_human',
      'failed'
    )
  ),
  source_fingerprint TEXT NOT NULL,
  source_url TEXT,
  supplier_id UUID REFERENCES catalogos.suppliers(id) ON DELETE SET NULL,
  blocked_reason TEXT,
  blocked_at TIMESTAMPTZ,
  failed_reason TEXT,
  lineage JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ingestion_jobs_status_created
  ON catalog_v2.ingestion_jobs (status, created_at DESC);

CREATE INDEX idx_ingestion_jobs_supplier
  ON catalog_v2.ingestion_jobs (supplier_id)
  WHERE supplier_id IS NOT NULL;

CREATE UNIQUE INDEX idx_ingestion_jobs_source_fingerprint_active
  ON catalog_v2.ingestion_jobs (source_fingerprint)
  WHERE status NOT IN ('failed');

COMMENT ON TABLE catalog_v2.ingestion_jobs IS
  'Unified ingest orchestration for Quick Draft and Deep Supplier Crawl; converges into catalog_staging_*.';

-- -----------------------------------------------------------------------------
-- catalog_staging_products — lineage + fingerprints
-- -----------------------------------------------------------------------------
ALTER TABLE catalog_v2.catalog_staging_products
  ADD COLUMN IF NOT EXISTS ingestion_job_id UUID REFERENCES catalog_v2.ingestion_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ingestion_mode TEXT CHECK (
    ingestion_mode IS NULL OR ingestion_mode IN ('quick_draft', 'deep_supplier_crawl')
  ),
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS source_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS product_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'needs_review' CHECK (
    review_status IS NULL OR review_status IN ('needs_review', 'dismissed', 'promoted_to_draft')
  ),
  ADD COLUMN IF NOT EXISTS legacy_clipboard_staging_id UUID,
  ADD COLUMN IF NOT EXISTS media_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    media_status IN ('pending', 'ready', 'failed', 'waived')
  );

CREATE INDEX IF NOT EXISTS idx_catalog_staging_products_ingestion_job
  ON catalog_v2.catalog_staging_products (ingestion_job_id)
  WHERE ingestion_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_catalog_staging_products_source_fp
  ON catalog_v2.catalog_staging_products (source_fingerprint)
  WHERE source_fingerprint IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_staging_products_product_fp_active
  ON catalog_v2.catalog_staging_products (product_fingerprint)
  WHERE product_fingerprint IS NOT NULL AND status NOT IN ('rejected', 'promoted');

-- -----------------------------------------------------------------------------
-- catalog_staging_variants — variant grain fingerprints + media hooks
-- -----------------------------------------------------------------------------
ALTER TABLE catalog_v2.catalog_staging_variants
  ADD COLUMN IF NOT EXISTS ingestion_job_id UUID REFERENCES catalog_v2.ingestion_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS product_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS legacy_url_import_product_id UUID,
  ADD COLUMN IF NOT EXISTS media_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    media_status IN ('pending', 'ready', 'failed', 'waived')
  ),
  ADD COLUMN IF NOT EXISTS primary_image_url TEXT,
  ADD COLUMN IF NOT EXISTS managed_image_url TEXT;

CREATE INDEX IF NOT EXISTS idx_catalog_staging_variants_ingestion_job
  ON catalog_v2.catalog_staging_variants (ingestion_job_id)
  WHERE ingestion_job_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_staging_variants_product_fp_active
  ON catalog_v2.catalog_staging_variants (product_fingerprint)
  WHERE product_fingerprint IS NOT NULL AND status NOT IN ('rejected', 'promoted');

-- -----------------------------------------------------------------------------
-- ingestion_field_evidence — per-field extract + confidence
-- -----------------------------------------------------------------------------
CREATE TABLE catalog_v2.ingestion_field_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staging_variant_id UUID NOT NULL REFERENCES catalog_v2.catalog_staging_variants(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  extracted_value JSONB NOT NULL,
  confidence NUMERIC(5, 4) NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  source_type TEXT NOT NULL,
  source_ref TEXT,
  source_snippet TEXT,
  extraction_method TEXT NOT NULL DEFAULT 'deterministic' CHECK (extraction_method IN ('deterministic', 'ai_fallback')),
  supersedes_evidence_id UUID REFERENCES catalog_v2.ingestion_field_evidence(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ingestion_field_evidence_variant_field
  ON catalog_v2.ingestion_field_evidence (staging_variant_id, field_key, created_at DESC);

COMMENT ON TABLE catalog_v2.ingestion_field_evidence IS
  'Per-field ingestion evidence with confidence; supports operator override chains via supersedes_evidence_id.';
