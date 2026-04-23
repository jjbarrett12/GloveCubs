-- =============================================================================
-- Supplier file import: batch provenance + raw row ordering for large CSV jobs.
-- Aligns with catalogos import_batches / supplier_products_raw (no duplicate
-- supplier_import_* tables — staging remains raw + normalized).
-- =============================================================================

ALTER TABLE catalogos.import_batches
  ADD COLUMN IF NOT EXISTS source_kind TEXT NOT NULL DEFAULT 'feed',
  ADD COLUMN IF NOT EXISTS preview_session_id UUID REFERENCES catalogos.import_preview_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_filename TEXT;

COMMENT ON COLUMN catalogos.import_batches.source_kind IS
  'feed | csv_upload | excel | pdf | other — how rows entered the batch.';
COMMENT ON COLUMN catalogos.import_batches.preview_session_id IS
  'Optional link to AI CSV preview session (column mapping).';
COMMENT ON COLUMN catalogos.import_batches.source_filename IS
  'Original upload filename for operator traceability.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'import_batches_source_kind_check'
  ) THEN
    ALTER TABLE catalogos.import_batches
      ADD CONSTRAINT import_batches_source_kind_check
      CHECK (source_kind IN ('feed', 'csv_upload', 'excel', 'pdf', 'other'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_import_batches_preview_session
  ON catalogos.import_batches (preview_session_id)
  WHERE preview_session_id IS NOT NULL;

ALTER TABLE catalogos.supplier_products_raw
  ADD COLUMN IF NOT EXISTS source_row_index INT;

COMMENT ON COLUMN catalogos.supplier_products_raw.source_row_index IS
  '0-based row order in the source file (large-batch progress / retry UX).';

CREATE INDEX IF NOT EXISTS idx_supplier_products_raw_batch_row_index
  ON catalogos.supplier_products_raw (batch_id, source_row_index);
