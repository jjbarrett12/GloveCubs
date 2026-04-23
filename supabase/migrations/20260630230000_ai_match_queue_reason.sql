-- Pass-1 / pass-2: why a row was queued for deferred AI matching (nullable when not_needed).

ALTER TABLE catalogos.supplier_products_normalized
  ADD COLUMN IF NOT EXISTS ai_match_queue_reason TEXT;

COMMENT ON COLUMN catalogos.supplier_products_normalized.ai_match_queue_reason IS
  'Set when ai_match_status = pending: rules_below_threshold (candidate below LOW_CONFIDENCE), no_rules_match, etc.';
