-- =============================================================================
-- Catalog Expansion Agent: sync runs, item results, change events, discontinued.
-- Schema: catalogos. Compare feed state to prior; route to review safely.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- catalog_sync_runs
-- One per sync execution (feed + supplier).
-- -----------------------------------------------------------------------------
CREATE TABLE catalogos.catalog_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id UUID NOT NULL REFERENCES catalogos.supplier_feeds(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES catalogos.suppliers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_catalog_sync_runs_feed ON catalogos.catalog_sync_runs (feed_id);
CREATE INDEX idx_catalog_sync_runs_supplier ON catalogos.catalog_sync_runs (supplier_id);
CREATE INDEX idx_catalog_sync_runs_started ON catalogos.catalog_sync_runs (started_at DESC);

COMMENT ON TABLE catalogos.catalog_sync_runs IS 'Catalog expansion sync run; compares current feed to prior batch.';

-- -----------------------------------------------------------------------------
-- catalog_sync_item_results
-- Per external_id result: new, changed, unchanged, missing.
-- -----------------------------------------------------------------------------
CREATE TABLE catalogos.catalog_sync_item_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES catalogos.catalog_sync_runs(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  result_type TEXT NOT NULL CHECK (result_type IN ('new', 'changed', 'unchanged', 'missing')),
  prior_raw_id UUID REFERENCES catalogos.supplier_products_raw(id) ON DELETE SET NULL,
  prior_normalized_id UUID REFERENCES catalogos.supplier_products_normalized(id) ON DELETE SET NULL,
  current_batch_raw_id UUID REFERENCES catalogos.supplier_products_raw(id) ON DELETE SET NULL,
  change_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  requires_review BOOLEAN NOT NULL DEFAULT true,
  resolved_at TIMESTAMPTZ,
  resolution TEXT CHECK (resolution IS NULL OR resolution IN ('approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_catalog_sync_item_results_run ON catalogos.catalog_sync_item_results (run_id);
CREATE INDEX idx_catalog_sync_item_results_type ON catalogos.catalog_sync_item_results (result_type);
CREATE INDEX idx_catalog_sync_item_results_review ON catalogos.catalog_sync_item_results (run_id, requires_review) WHERE requires_review = true;

COMMENT ON TABLE catalogos.catalog_sync_item_results IS 'Per-row sync result; change_summary holds diff (e.g. cost_old, cost_new).';

-- -----------------------------------------------------------------------------
-- product_change_events
-- Audit log of product-level changes (title, content, packaging).
-- -----------------------------------------------------------------------------
CREATE TABLE catalogos.product_change_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES catalogos.catalog_sync_runs(id) ON DELETE CASCADE,
  sync_item_result_id UUID REFERENCES catalogos.catalog_sync_item_results(id) ON DELETE SET NULL,
  product_id UUID REFERENCES catalogos.products(id) ON DELETE SET NULL,
  normalized_id UUID REFERENCES catalogos.supplier_products_normalized(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_product_change_events_run ON catalogos.product_change_events (run_id);

COMMENT ON TABLE catalogos.product_change_events IS 'Product/content/packaging change events for audit.';

-- -----------------------------------------------------------------------------
-- supplier_offer_change_events
-- Cost/sell_price change events; strict review.
-- -----------------------------------------------------------------------------
CREATE TABLE catalogos.supplier_offer_change_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES catalogos.catalog_sync_runs(id) ON DELETE CASCADE,
  sync_item_result_id UUID REFERENCES catalogos.catalog_sync_item_results(id) ON DELETE SET NULL,
  offer_id UUID REFERENCES catalogos.supplier_offers(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('cost_change', 'sell_price_change', 'availability_change')),
  old_value NUMERIC(20,6),
  new_value NUMERIC(20,6),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_supplier_offer_change_events_run ON catalogos.supplier_offer_change_events (run_id);

COMMENT ON TABLE catalogos.supplier_offer_change_events IS 'Pricing/availability change events; require review before apply.';

-- -----------------------------------------------------------------------------
-- discontinued_product_candidates
-- Items missing from latest feed; resolve as discontinued or false positive.
-- -----------------------------------------------------------------------------
CREATE TABLE catalogos.discontinued_product_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES catalogos.catalog_sync_runs(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES catalogos.suppliers(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  prior_raw_id UUID REFERENCES catalogos.supplier_products_raw(id) ON DELETE SET NULL,
  prior_normalized_id UUID REFERENCES catalogos.supplier_products_normalized(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'confirmed_discontinued', 'false_positive')),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_discontinued_candidates_run ON catalogos.discontinued_product_candidates (run_id);
CREATE INDEX idx_discontinued_candidates_status ON catalogos.discontinued_product_candidates (status);

COMMENT ON TABLE catalogos.discontinued_product_candidates IS 'Products missing from feed; confirm discontinued or false positive.';
