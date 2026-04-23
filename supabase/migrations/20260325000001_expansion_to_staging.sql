-- =============================================================================
-- Connect Catalog Expansion to Staging: promotion fields, discontinued audit.
-- Schema: catalogos.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- catalog_sync_item_results: current_snapshot + promotion tracking
-- -----------------------------------------------------------------------------
ALTER TABLE catalogos.catalog_sync_item_results
  ADD COLUMN IF NOT EXISTS current_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS promoted_normalized_id UUID REFERENCES catalogos.supplier_products_normalized(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS promotion_status TEXT NOT NULL DEFAULT 'pending' CHECK (promotion_status IN ('pending', 'promoted', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_catalog_sync_item_results_promotion
  ON catalogos.catalog_sync_item_results (promotion_status) WHERE promotion_status = 'pending';

COMMENT ON COLUMN catalogos.catalog_sync_item_results.current_snapshot IS 'Parsed feed row for new/changed; used when promoting to staging.';
COMMENT ON COLUMN catalogos.catalog_sync_item_results.promoted_normalized_id IS 'Staged row created when sync item is approved and promoted.';
COMMENT ON COLUMN catalogos.catalog_sync_item_results.promotion_status IS 'pending | promoted | rejected; prevents duplicate staged rows.';

-- -----------------------------------------------------------------------------
-- supplier_offers: discontinued audit
-- -----------------------------------------------------------------------------
ALTER TABLE catalogos.supplier_offers
  ADD COLUMN IF NOT EXISTS discontinued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS discontinued_reason TEXT;

COMMENT ON COLUMN catalogos.supplier_offers.discontinued_at IS 'When offer was marked discontinued (e.g. catalog sync confirmed).';
COMMENT ON COLUMN catalogos.supplier_offers.discontinued_reason IS 'Audit: reason (e.g. catalog_sync_confirmed).';
