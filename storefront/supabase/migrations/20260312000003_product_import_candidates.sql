-- Product Import Candidates
-- Migration: 20260312000003_product_import_candidates.sql
--
-- Supports the admin workflow for creating products from external URLs.
-- Tracks extraction results, duplicate detection, and approval workflow.

-- ============================================================================
-- PRODUCT IMPORT CANDIDATES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS product_import_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Source info
  source_url TEXT NOT NULL,
  source_domain TEXT,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (
    status IN ('pending_review', 'approved', 'rejected', 'auto_created', 'merged')
  ),
  
  -- Extracted data (JSON)
  extracted_data JSONB NOT NULL DEFAULT '{}',
  
  -- Confidence and reasoning
  overall_confidence NUMERIC(4,3) DEFAULT 0,
  field_confidence JSONB DEFAULT '{}',
  extraction_reasoning TEXT,
  extraction_sources TEXT[] DEFAULT '{}',
  extraction_warnings TEXT[] DEFAULT '{}',
  
  -- Duplicate detection
  potential_duplicates JSONB DEFAULT '[]',
  duplicate_confidence NUMERIC(4,3) DEFAULT 0,
  
  -- Admin workflow
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  
  -- Result
  created_product_id UUID,
  merged_into_product_id UUID
);

COMMENT ON TABLE product_import_candidates IS 'Product candidates imported from external URLs pending review';
COMMENT ON COLUMN product_import_candidates.source_url IS 'Original URL the product was imported from';
COMMENT ON COLUMN product_import_candidates.extracted_data IS 'JSON blob of all extracted product attributes';
COMMENT ON COLUMN product_import_candidates.potential_duplicates IS 'JSON array of potential duplicate products in catalog';
COMMENT ON COLUMN product_import_candidates.overall_confidence IS 'Extraction confidence score 0-1';

-- Indexes
CREATE INDEX idx_import_candidates_status ON product_import_candidates(status);
CREATE INDEX idx_import_candidates_created_by ON product_import_candidates(created_by);
CREATE INDEX idx_import_candidates_created_at ON product_import_candidates(created_at DESC);
CREATE INDEX idx_import_candidates_domain ON product_import_candidates(source_domain);
CREATE INDEX idx_import_candidates_confidence ON product_import_candidates(overall_confidence DESC);

-- ============================================================================
-- PRODUCT IMPORT AUDIT LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS product_import_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES product_import_candidates(id),
  action TEXT NOT NULL CHECK (
    action IN ('created', 'reviewed', 'approved', 'rejected', 'merged', 'auto_created')
  ),
  user_id UUID NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE product_import_audit_log IS 'Audit trail for product import actions';

CREATE INDEX idx_import_audit_candidate ON product_import_audit_log(candidate_id);
CREATE INDEX idx_import_audit_user ON product_import_audit_log(user_id);
CREATE INDEX idx_import_audit_action ON product_import_audit_log(action);
CREATE INDEX idx_import_audit_created ON product_import_audit_log(created_at DESC);

-- ============================================================================
-- IMPORT STATISTICS VIEW
-- ============================================================================

CREATE OR REPLACE VIEW product_import_stats AS
SELECT
  DATE_TRUNC('day', created_at) AS date,
  status,
  COUNT(*) AS count,
  AVG(overall_confidence) AS avg_confidence,
  AVG(duplicate_confidence) AS avg_duplicate_confidence,
  COUNT(DISTINCT source_domain) AS unique_domains
FROM product_import_candidates
GROUP BY DATE_TRUNC('day', created_at), status;

-- ============================================================================
-- ADD source_url AND import_confidence TO canonical_products
-- ============================================================================

DO $$
BEGIN
  -- Add source_url if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'canonical_products' AND column_name = 'source_url'
  ) THEN
    ALTER TABLE canonical_products ADD COLUMN source_url TEXT;
  END IF;
  
  -- Add import_confidence if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'canonical_products' AND column_name = 'import_confidence'
  ) THEN
    ALTER TABLE canonical_products ADD COLUMN import_confidence NUMERIC(4,3);
  END IF;
END $$;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE product_import_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_import_audit_log ENABLE ROW LEVEL SECURITY;

-- Admin-only access to import candidates
CREATE POLICY "Admin access to import candidates"
  ON product_import_candidates
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.is_active = true
    )
  );

-- Admin-only access to audit log
CREATE POLICY "Admin access to import audit log"
  ON product_import_audit_log
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.is_active = true
    )
  );

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to log import audit events
CREATE OR REPLACE FUNCTION log_import_audit_event(
  p_candidate_id UUID,
  p_action TEXT,
  p_user_id UUID,
  p_details JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
  v_audit_id UUID;
BEGIN
  INSERT INTO product_import_audit_log (candidate_id, action, user_id, details)
  VALUES (p_candidate_id, p_action, p_user_id, p_details)
  RETURNING id INTO v_audit_id;
  
  RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get import statistics
CREATE OR REPLACE FUNCTION get_import_statistics(p_days INTEGER DEFAULT 30)
RETURNS TABLE (
  total_candidates BIGINT,
  pending_review BIGINT,
  approved BIGINT,
  rejected BIGINT,
  merged BIGINT,
  avg_confidence NUMERIC,
  unique_domains BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_candidates,
    COUNT(*) FILTER (WHERE status = 'pending_review')::BIGINT AS pending_review,
    COUNT(*) FILTER (WHERE status = 'approved')::BIGINT AS approved,
    COUNT(*) FILTER (WHERE status = 'rejected')::BIGINT AS rejected,
    COUNT(*) FILTER (WHERE status = 'merged')::BIGINT AS merged,
    COALESCE(AVG(overall_confidence), 0) AS avg_confidence,
    COUNT(DISTINCT source_domain)::BIGINT AS unique_domains
  FROM product_import_candidates
  WHERE created_at >= NOW() - (p_days || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGER FOR AUDIT LOG ON STATUS CHANGE
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_import_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM log_import_audit_event(
      NEW.id,
      NEW.status,
      COALESCE(NEW.reviewed_by, NEW.created_by),
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'review_notes', NEW.review_notes
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER import_status_change_trigger
  AFTER UPDATE ON product_import_candidates
  FOR EACH ROW
  EXECUTE FUNCTION trigger_import_status_change();
