-- =============================================================================
-- Product Matching Agent: match runs, match candidates, duplicate candidates.
-- Schema: catalogos. Improves duplicate detection and master product matching.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- product_match_runs
-- One per matching run (batch or all pending).
-- -----------------------------------------------------------------------------
CREATE TABLE catalogos.product_match_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES catalogos.import_batches(id) ON DELETE SET NULL,
  scope TEXT NOT NULL DEFAULT 'batch' CHECK (scope IN ('batch', 'all_pending')),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_product_match_runs_batch ON catalogos.product_match_runs (batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX idx_product_match_runs_started ON catalogos.product_match_runs (started_at DESC);

COMMENT ON TABLE catalogos.product_match_runs IS 'Product matching agent run; scope batch or all_pending.';

-- -----------------------------------------------------------------------------
-- product_match_candidates
-- Per normalized row: suggested master, confidence, reason, candidate list.
-- -----------------------------------------------------------------------------
CREATE TABLE catalogos.product_match_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES catalogos.product_match_runs(id) ON DELETE CASCADE,
  normalized_id UUID NOT NULL REFERENCES catalogos.supplier_products_normalized(id) ON DELETE CASCADE,
  suggested_master_product_id UUID REFERENCES catalogos.products(id) ON DELETE SET NULL,
  confidence NUMERIC(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  reason TEXT NOT NULL,
  candidate_list JSONB NOT NULL DEFAULT '[]'::jsonb,
  duplicate_warning BOOLEAN NOT NULL DEFAULT false,
  requires_review BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_match_candidates_run_normalized UNIQUE (run_id, normalized_id)
);

CREATE INDEX idx_product_match_candidates_run ON catalogos.product_match_candidates (run_id);
CREATE INDEX idx_product_match_candidates_normalized ON catalogos.product_match_candidates (normalized_id);
CREATE INDEX idx_product_match_candidates_review ON catalogos.product_match_candidates (run_id, requires_review) WHERE requires_review = true;

COMMENT ON TABLE catalogos.product_match_candidates IS 'Match result per staged row: suggested master, confidence, reason, top candidates.';

-- -----------------------------------------------------------------------------
-- product_duplicate_candidates
-- Pairs of master products that may be duplicates.
-- -----------------------------------------------------------------------------
CREATE TABLE catalogos.product_duplicate_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES catalogos.product_match_runs(id) ON DELETE SET NULL,
  product_id_a UUID NOT NULL REFERENCES catalogos.products(id) ON DELETE CASCADE,
  product_id_b UUID NOT NULL REFERENCES catalogos.products(id) ON DELETE CASCADE,
  score NUMERIC(5,4) NOT NULL CHECK (score >= 0 AND score <= 1),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'merged', 'dismissed')),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_duplicate_pair_order CHECK (product_id_a < product_id_b),
  CONSTRAINT uq_duplicate_pair UNIQUE (product_id_a, product_id_b)
);

CREATE INDEX idx_product_duplicate_candidates_run ON catalogos.product_duplicate_candidates (run_id) WHERE run_id IS NOT NULL;
CREATE INDEX idx_product_duplicate_candidates_status ON catalogos.product_duplicate_candidates (status);

COMMENT ON TABLE catalogos.product_duplicate_candidates IS 'Possible duplicate master products; require review before merge.';
