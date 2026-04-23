-- Supplier Feed Upload Schema
-- Migration: 20260311000012_feed_upload.sql

-- ============================================================================
-- FEED UPLOADS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS catalogos.supplier_feed_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES catalogos.suppliers(id),
  user_id UUID REFERENCES catalogos.supplier_users(id),
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('csv', 'xlsx', 'price_sheet')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'parsing', 'extracting', 'normalizing', 'preview', 'committed', 'failed')
  ),
  total_rows INTEGER NOT NULL DEFAULT 0,
  processed_rows INTEGER NOT NULL DEFAULT 0,
  error_rows INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

COMMENT ON TABLE catalogos.supplier_feed_uploads IS 'Tracks supplier feed upload jobs';

CREATE INDEX idx_feed_uploads_supplier ON catalogos.supplier_feed_uploads(supplier_id);
CREATE INDEX idx_feed_uploads_status ON catalogos.supplier_feed_uploads(status);
CREATE INDEX idx_feed_uploads_date ON catalogos.supplier_feed_uploads(created_at DESC);

-- ============================================================================
-- FEED UPLOAD ROWS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS catalogos.supplier_feed_upload_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id UUID NOT NULL REFERENCES catalogos.supplier_feed_uploads(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  extracted JSONB NOT NULL DEFAULT '{}'::jsonb,
  normalized JSONB NOT NULL DEFAULT '{}'::jsonb,
  validation JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'warning', 'error')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE catalogos.supplier_feed_upload_rows IS 'Parsed rows from feed uploads for preview and correction';

CREATE INDEX idx_feed_rows_upload ON catalogos.supplier_feed_upload_rows(upload_id);
CREATE INDEX idx_feed_rows_status ON catalogos.supplier_feed_upload_rows(status);
CREATE UNIQUE INDEX idx_feed_rows_unique ON catalogos.supplier_feed_upload_rows(upload_id, row_number);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE catalogos.supplier_feed_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos.supplier_feed_upload_rows ENABLE ROW LEVEL SECURITY;

-- Suppliers can only see their own uploads
CREATE POLICY feed_uploads_select ON catalogos.supplier_feed_uploads
  FOR SELECT USING (supplier_id = catalogos.get_current_supplier_id());

CREATE POLICY feed_uploads_insert ON catalogos.supplier_feed_uploads
  FOR INSERT WITH CHECK (supplier_id = catalogos.get_current_supplier_id());

CREATE POLICY feed_uploads_update ON catalogos.supplier_feed_uploads
  FOR UPDATE USING (supplier_id = catalogos.get_current_supplier_id());

-- Rows follow parent upload
CREATE POLICY feed_rows_select ON catalogos.supplier_feed_upload_rows
  FOR SELECT USING (
    upload_id IN (
      SELECT id FROM catalogos.supplier_feed_uploads 
      WHERE supplier_id = catalogos.get_current_supplier_id()
    )
  );

CREATE POLICY feed_rows_insert ON catalogos.supplier_feed_upload_rows
  FOR INSERT WITH CHECK (
    upload_id IN (
      SELECT id FROM catalogos.supplier_feed_uploads 
      WHERE supplier_id = catalogos.get_current_supplier_id()
    )
  );

CREATE POLICY feed_rows_update ON catalogos.supplier_feed_upload_rows
  FOR UPDATE USING (
    upload_id IN (
      SELECT id FROM catalogos.supplier_feed_uploads 
      WHERE supplier_id = catalogos.get_current_supplier_id()
    )
  );

CREATE POLICY feed_rows_delete ON catalogos.supplier_feed_upload_rows
  FOR DELETE USING (
    upload_id IN (
      SELECT id FROM catalogos.supplier_feed_uploads 
      WHERE supplier_id = catalogos.get_current_supplier_id()
    )
  );

-- ============================================================================
-- CLEANUP FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION catalogos.cleanup_old_feed_uploads(
  p_retention_days INTEGER DEFAULT 7
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Delete old uploads (rows cascade)
  DELETE FROM catalogos.supplier_feed_uploads
  WHERE status IN ('committed', 'failed')
    AND created_at < now() - (p_retention_days || ' days')::INTERVAL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
