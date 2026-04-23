-- =============================================================================
-- Product identity and resolution graph: candidates, alias memory, SKU patterns,
-- and match decisions so catalog growth becomes increasingly automatic.
-- =============================================================================

-- Match type for resolution candidates
DO $$ BEGIN
  CREATE TYPE catalogos.resolution_match_type AS ENUM (
    'family',
    'variant',
    'offer',
    'duplicate',
    'new_product'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Resolution candidate status
DO $$ BEGIN
  CREATE TYPE catalogos.resolution_candidate_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'superseded'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- product_resolution_candidates
-- One or more candidates per normalized row; best match can be approved in review.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalogos.product_resolution_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES catalogos.import_batches(id) ON DELETE CASCADE,
  normalized_row_id UUID NOT NULL REFERENCES catalogos.supplier_products_normalized(id) ON DELETE CASCADE,
  candidate_family_id UUID REFERENCES catalogos.product_families(id) ON DELETE SET NULL,
  candidate_product_id UUID REFERENCES catalogos.products(id) ON DELETE SET NULL,
  match_type catalogos.resolution_match_type NOT NULL,
  confidence NUMERIC(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  reasons_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  status catalogos.resolution_candidate_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  CONSTRAINT chk_resolution_candidate_target CHECK (
    candidate_family_id IS NOT NULL OR candidate_product_id IS NOT NULL OR match_type = 'new_product'
  )
);

CREATE INDEX IF NOT EXISTS idx_resolution_candidates_batch ON catalogos.product_resolution_candidates (batch_id);
CREATE INDEX IF NOT EXISTS idx_resolution_candidates_normalized ON catalogos.product_resolution_candidates (normalized_row_id);
CREATE INDEX IF NOT EXISTS idx_resolution_candidates_status ON catalogos.product_resolution_candidates (status);
CREATE INDEX IF NOT EXISTS idx_resolution_candidates_match_type ON catalogos.product_resolution_candidates (match_type);

COMMENT ON TABLE catalogos.product_resolution_candidates IS 'Candidate resolutions for each imported normalized row; review approves one or marks new.';

-- -----------------------------------------------------------------------------
-- product_aliases
-- Reusable alias memory: normalized meaning over time (e.g. food safe -> food_service_grade).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalogos.product_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alias_key TEXT NOT NULL,
  canonical_value TEXT NOT NULL,
  attribute_domain TEXT NOT NULL DEFAULT 'general',
  usage_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_product_aliases_key_domain UNIQUE (alias_key, attribute_domain)
);

CREATE INDEX IF NOT EXISTS idx_product_aliases_key ON catalogos.product_aliases (alias_key);
CREATE INDEX IF NOT EXISTS idx_product_aliases_canonical ON catalogos.product_aliases (canonical_value);

COMMENT ON TABLE catalogos.product_aliases IS 'Learned aliases for attribute normalization (e.g. food safe -> food_service_grade).';

-- -----------------------------------------------------------------------------
-- sku_pattern_memory
-- Learned SKU family/variant rules by brand or supplier.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalogos.sku_pattern_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES catalogos.brands(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES catalogos.suppliers(id) ON DELETE CASCADE,
  base_sku_pattern TEXT NOT NULL,
  suffix_type TEXT NOT NULL DEFAULT 'size',
  suffix_values TEXT[] NOT NULL DEFAULT '{}',
  example_skus TEXT[] DEFAULT '{}',
  usage_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_sku_pattern_scope CHECK (brand_id IS NOT NULL OR supplier_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_sku_pattern_brand ON catalogos.sku_pattern_memory (brand_id) WHERE brand_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sku_pattern_supplier ON catalogos.sku_pattern_memory (supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sku_pattern_base ON catalogos.sku_pattern_memory (base_sku_pattern);

COMMENT ON TABLE catalogos.sku_pattern_memory IS 'Learned SKU family/variant rules (e.g. GL-N125F + S/M/L/XL) by brand or supplier.';

-- -----------------------------------------------------------------------------
-- match_decisions
-- When an admin approves a family/variant grouping or resolves a duplicate, store for reuse.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalogos.match_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES catalogos.suppliers(id) ON DELETE CASCADE,
  decision_key TEXT NOT NULL,
  candidate_family_id UUID REFERENCES catalogos.product_families(id) ON DELETE SET NULL,
  candidate_product_id UUID REFERENCES catalogos.products(id) ON DELETE SET NULL,
  match_type catalogos.resolution_match_type NOT NULL,
  decided_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_match_decision_target CHECK (
    candidate_family_id IS NOT NULL OR candidate_product_id IS NOT NULL OR match_type = 'new_product'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_match_decisions_supplier_key ON catalogos.match_decisions (supplier_id, decision_key);
CREATE INDEX IF NOT EXISTS idx_match_decisions_product ON catalogos.match_decisions (candidate_product_id) WHERE candidate_product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_match_decisions_family ON catalogos.match_decisions (candidate_family_id) WHERE candidate_family_id IS NOT NULL;

COMMENT ON TABLE catalogos.match_decisions IS 'Admin resolution decisions keyed by supplier + SKU (or hash) for future import reuse.';

-- -----------------------------------------------------------------------------
-- Seed common product_aliases (grade / material / packaging)
-- -----------------------------------------------------------------------------
INSERT INTO catalogos.product_aliases (alias_key, canonical_value, attribute_domain, usage_count)
VALUES
  ('food safe', 'food_service_grade', 'grade', 0),
  ('food-safe', 'food_service_grade', 'grade', 0),
  ('powder free', 'powder_free', 'grade', 0),
  ('powder-free', 'powder_free', 'grade', 0),
  ('exam grade', 'examination', 'grade', 0),
  ('exam-grade', 'examination', 'grade', 0),
  ('examination grade', 'examination', 'grade', 0),
  ('nitrile', 'nitrile', 'material', 0),
  ('vinyl', 'vinyl', 'material', 0),
  ('latex', 'latex', 'material', 0)
ON CONFLICT (alias_key, attribute_domain) DO NOTHING;
