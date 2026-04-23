-- Resumable supplier import jobs (large CSV/XLSX pipelines).
-- Raw rows: catalogos.supplier_products_raw (immutable per batch).
-- Normalized: catalogos.supplier_products_normalized; families: inference + product_families.

CREATE TYPE catalogos.supplier_import_job_status AS ENUM (
  'uploaded',
  'parsing',
  'normalizing',
  'matching',
  'variant_grouping',
  'ready_for_review',
  'approved',
  'publishing',
  'published',
  'failed',
  'cancelled'
);

CREATE TABLE catalogos.supplier_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  supplier_id UUID NOT NULL REFERENCES catalogos.suppliers (id) ON DELETE CASCADE,
  status catalogos.supplier_import_job_status NOT NULL DEFAULT 'uploaded',
  total_rows INT NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  processed_rows INT NOT NULL DEFAULT 0 CHECK (processed_rows >= 0),
  error_rows INT NOT NULL DEFAULT 0 CHECK (error_rows >= 0),
  current_stage TEXT NOT NULL DEFAULT '',
  file_path TEXT,
  file_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  error_log JSONB NOT NULL DEFAULT '[]'::jsonb,
  batch_id UUID REFERENCES catalogos.import_batches (id) ON DELETE SET NULL,
  preview_session_id TEXT,
  resume_cursor JSONB NOT NULL DEFAULT '{}'::jsonb,
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  cancel_requested_at TIMESTAMPTZ,
  CONSTRAINT chk_supplier_import_jobs_row_counts_nonneg CHECK (
    total_rows >= 0 AND processed_rows >= 0 AND error_rows >= 0
  )
);

CREATE INDEX idx_supplier_import_jobs_supplier ON catalogos.supplier_import_jobs (supplier_id);
CREATE INDEX idx_supplier_import_jobs_org ON catalogos.supplier_import_jobs (organization_id)
  WHERE organization_id IS NOT NULL;
CREATE INDEX idx_supplier_import_jobs_status ON catalogos.supplier_import_jobs (status);
CREATE INDEX idx_supplier_import_jobs_batch ON catalogos.supplier_import_jobs (batch_id)
  WHERE batch_id IS NOT NULL;
CREATE INDEX idx_supplier_import_jobs_created ON catalogos.supplier_import_jobs (created_at DESC);

COMMENT ON TABLE catalogos.supplier_import_jobs IS
  'Chunked, resumable supplier catalog import; links to import_batches and supplier_products_raw.';

COMMENT ON COLUMN catalogos.supplier_import_jobs.file_path IS
  'Source file reference (e.g. Supabase Storage path, blob URL, or server temp path).';

COMMENT ON COLUMN catalogos.supplier_import_jobs.resume_cursor IS
  'Idempotency cursor: e.g. { "stage": "normalize", "last_source_row_index": 499 }';

COMMENT ON COLUMN catalogos.supplier_import_jobs.stats IS
  'Derived fields: percent_complete, chunks_total, chunks_processed, ingestion_phase, etc.';

ALTER TABLE catalogos.supplier_import_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "catalogos_admin_all_supplier_import_jobs"
  ON catalogos.supplier_import_jobs FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Chunked resume: raw rows that do not yet have a normalized staging row.
CREATE OR REPLACE FUNCTION catalogos.supplier_raw_rows_missing_normalized(p_batch_id uuid, p_limit int)
RETURNS TABLE (
  id uuid,
  external_id text,
  raw_payload jsonb,
  source_row_index int
)
LANGUAGE sql
STABLE
AS $$
  SELECT r.id, r.external_id, r.raw_payload, r.source_row_index
  FROM catalogos.supplier_products_raw r
  WHERE r.batch_id = p_batch_id
  AND NOT EXISTS (
    SELECT 1 FROM catalogos.supplier_products_normalized n WHERE n.raw_id = r.id
  )
  ORDER BY r.source_row_index
  LIMIT GREATEST(p_limit, 1);
$$;

COMMENT ON FUNCTION catalogos.supplier_raw_rows_missing_normalized IS
  'Returns the next chunk of raw rows without supplier_products_normalized (idempotent resume).';

GRANT EXECUTE ON FUNCTION catalogos.supplier_raw_rows_missing_normalized(uuid, int) TO authenticated, service_role;
