-- Two-pass supplier matching: pass 1 = rules only during ingestion; pass 2 = deferred AI batch job.

ALTER TABLE catalogos.supplier_products_normalized
  ADD COLUMN IF NOT EXISTS match_method TEXT NOT NULL DEFAULT 'none'
    CHECK (match_method IN ('rules', 'none')),
  ADD COLUMN IF NOT EXISTS ai_match_status TEXT NOT NULL DEFAULT 'not_needed'
    CHECK (ai_match_status IN ('not_needed', 'pending', 'processing', 'completed', 'failed')),
  ADD COLUMN IF NOT EXISTS ai_suggested_master_product_id UUID REFERENCES catalogos.products (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_confidence NUMERIC(5,4)
    CHECK (ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1));

COMMENT ON COLUMN catalogos.supplier_products_normalized.match_method IS 'rules = master_product_id set from rules matcher in pass 1; none = no rules match or below threshold.';
COMMENT ON COLUMN catalogos.supplier_products_normalized.ai_match_status IS 'not_needed = rules match sufficient; pending = queued for deferred AI; processing = worker claimed; completed/failed = pass 2 finished.';
COMMENT ON COLUMN catalogos.supplier_products_normalized.ai_suggested_master_product_id IS 'AI-suggested master product (pass 2); apply via review approve to set master_product_id.';
COMMENT ON COLUMN catalogos.supplier_products_normalized.ai_confidence IS 'Model confidence for ai_suggested_master_product_id; distinct from match_confidence (rules).';

CREATE INDEX IF NOT EXISTS idx_spn_batch_ai_pending
  ON catalogos.supplier_products_normalized (batch_id, ai_match_status)
  WHERE ai_match_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_spn_batch_ai_suggestions
  ON catalogos.supplier_products_normalized (batch_id)
  WHERE ai_match_status = 'completed' AND ai_suggested_master_product_id IS NOT NULL AND status = 'pending';

-- Backfill existing rows (historical imports pre–two-pass).
UPDATE catalogos.supplier_products_normalized
SET match_method = CASE WHEN master_product_id IS NOT NULL THEN 'rules' ELSE 'none' END
WHERE match_method = 'none';

UPDATE catalogos.supplier_products_normalized
SET ai_match_status = 'completed'
WHERE ai_matching_used IS TRUE AND ai_match_status = 'not_needed';
