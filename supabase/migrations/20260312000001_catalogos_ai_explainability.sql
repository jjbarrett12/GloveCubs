-- Optional: dedicated columns for AI explainability on supplier_products_normalized.
-- If you prefer to keep AI data only in normalized_data JSONB, skip this migration.

ALTER TABLE catalogos.supplier_products_normalized
  ADD COLUMN IF NOT EXISTS extraction_explanation TEXT,
  ADD COLUMN IF NOT EXISTS ai_extraction_used BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_extraction_result JSONB,
  ADD COLUMN IF NOT EXISTS match_explanation TEXT,
  ADD COLUMN IF NOT EXISTS ai_matching_used BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_match_result JSONB;

COMMENT ON COLUMN catalogos.supplier_products_normalized.extraction_explanation IS 'Why attributes were chosen (rules vs AI).';
COMMENT ON COLUMN catalogos.supplier_products_normalized.ai_extraction_used IS 'True if AI extraction was invoked for this row.';
COMMENT ON COLUMN catalogos.supplier_products_normalized.ai_extraction_result IS 'Full AI extraction response for audit.';
COMMENT ON COLUMN catalogos.supplier_products_normalized.match_explanation IS 'Why this master product was matched (or no match).';
COMMENT ON COLUMN catalogos.supplier_products_normalized.ai_matching_used IS 'True if AI matching was invoked.';
COMMENT ON COLUMN catalogos.supplier_products_normalized.ai_match_result IS 'Full AI match response for audit.';
