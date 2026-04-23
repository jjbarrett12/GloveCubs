-- =============================================================================
-- Sync lifecycle tracking: lifecycle_status, supersession, published_product_id.
-- Schema: catalogos.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- catalog_sync_item_results: lifecycle + supersession + published link
-- -----------------------------------------------------------------------------
ALTER TABLE catalogos.catalog_sync_item_results
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (lifecycle_status IN ('pending', 'promoted', 'in_review', 'approved', 'published', 'rejected', 'superseded')),
  ADD COLUMN IF NOT EXISTS superseded_by_sync_item_result_id UUID REFERENCES catalogos.catalog_sync_item_results(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS published_product_id UUID REFERENCES catalogos.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lifecycle_updated_at TIMESTAMPTZ;

-- Backfill lifecycle_status from promotion_status where present
UPDATE catalogos.catalog_sync_item_results
SET lifecycle_status = CASE
  WHEN promotion_status = 'promoted' THEN 'promoted'
  WHEN promotion_status = 'rejected' THEN 'rejected'
  ELSE COALESCE(lifecycle_status, 'pending')
END
WHERE lifecycle_status = 'pending' AND promotion_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_catalog_sync_item_results_lifecycle
  ON catalogos.catalog_sync_item_results (lifecycle_status);

CREATE INDEX IF NOT EXISTS idx_catalog_sync_item_results_superseded_by
  ON catalogos.catalog_sync_item_results (superseded_by_sync_item_result_id) WHERE superseded_by_sync_item_result_id IS NOT NULL;

-- Unique unresolved per (run.supplier_id, external_id): use partial index to find "latest unresolved" per supplier+external_id
CREATE INDEX IF NOT EXISTS idx_catalog_sync_item_results_supplier_external_unresolved
  ON catalogos.catalog_sync_item_results (external_id, run_id)
  WHERE lifecycle_status IN ('pending', 'promoted', 'in_review');

COMMENT ON COLUMN catalogos.catalog_sync_item_results.lifecycle_status IS 'pending | promoted | in_review | approved | published | rejected | superseded';
COMMENT ON COLUMN catalogos.catalog_sync_item_results.superseded_by_sync_item_result_id IS 'Set when this result is replaced by a newer sync for same supplier+external_id';
COMMENT ON COLUMN catalogos.catalog_sync_item_results.published_product_id IS 'Master product id once promoted row is published to live';
