-- Phase 5: governed glove spec groups, substitution edges, savings opportunities (no customer UI).

-- -----------------------------------------------------------------------------
-- gc_commerce.glove_spec_groups
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gc_commerce.glove_spec_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_gc_glove_spec_groups_slug UNIQUE (slug),
  CONSTRAINT ck_gc_glove_spec_groups_status CHECK (status IN ('draft', 'active', 'retired'))
);

CREATE INDEX IF NOT EXISTS idx_gc_glove_spec_groups_status ON gc_commerce.glove_spec_groups (status);

-- -----------------------------------------------------------------------------
-- gc_commerce.glove_spec_group_members (curated membership; no auto-grouping)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gc_commerce.glove_spec_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spec_group_id UUID NOT NULL REFERENCES gc_commerce.glove_spec_groups (id) ON DELETE CASCADE,
  catalog_product_id UUID NOT NULL,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  decision_source TEXT NOT NULL DEFAULT 'system',
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_to TIMESTAMPTZ,
  units_per_line_uom NUMERIC(14, 4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_gc_glove_spec_group_member_product UNIQUE (spec_group_id, catalog_product_id),
  CONSTRAINT ck_gc_glove_spec_group_member_decision CHECK (decision_source IN ('system', 'operator', 'rerun'))
);

CREATE INDEX IF NOT EXISTS idx_gc_glove_spec_group_members_group ON gc_commerce.glove_spec_group_members (spec_group_id);
CREATE INDEX IF NOT EXISTS idx_gc_glove_spec_group_members_product ON gc_commerce.glove_spec_group_members (catalog_product_id);
-- Partial index cannot use NOW() (not IMMUTABLE). Approved rows are indexed; callers filter valid_to at query time.
CREATE INDEX IF NOT EXISTS idx_gc_glove_spec_group_members_approved
  ON gc_commerce.glove_spec_group_members (spec_group_id, catalog_product_id)
  WHERE approved_at IS NOT NULL;

-- -----------------------------------------------------------------------------
-- gc_commerce.substitution_candidates (approved edges only participate in savings)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gc_commerce.substitution_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_catalog_product_id UUID NOT NULL,
  to_catalog_product_id UUID NOT NULL,
  spec_group_id UUID NOT NULL REFERENCES gc_commerce.glove_spec_groups (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_gc_substitution_from_to_group UNIQUE (from_catalog_product_id, to_catalog_product_id, spec_group_id),
  CONSTRAINT ck_gc_substitution_status CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_gc_substitution_from ON gc_commerce.substitution_candidates (from_catalog_product_id);
CREATE INDEX IF NOT EXISTS idx_gc_substitution_to ON gc_commerce.substitution_candidates (to_catalog_product_id);
CREATE INDEX IF NOT EXISTS idx_gc_substitution_approved
  ON gc_commerce.substitution_candidates (from_catalog_product_id, spec_group_id)
  WHERE status = 'approved';

-- -----------------------------------------------------------------------------
-- gc_commerce.savings_opportunities
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gc_commerce.savings_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES gc_commerce.companies (id) ON DELETE CASCADE,
  source_invoice_line_id UUID NOT NULL REFERENCES gc_commerce.invoice_lines (id) ON DELETE CASCADE,
  source_catalog_product_id UUID NOT NULL,
  candidate_catalog_product_id UUID,
  spec_group_id UUID NOT NULL REFERENCES gc_commerce.glove_spec_groups (id) ON DELETE CASCADE,
  substitution_candidate_id UUID REFERENCES gc_commerce.substitution_candidates (id) ON DELETE SET NULL,
  basis_uom TEXT NOT NULL,
  source_unit_price_normalized NUMERIC(14, 6),
  candidate_unit_price_normalized NUMERIC(14, 6),
  estimated_delta_per_basis NUMERIC(14, 6),
  trust_status TEXT NOT NULL DEFAULT 'draft',
  block_reason TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_gc_savings_op_trust CHECK (trust_status IN ('draft', 'rules_ok', 'operator_reviewed', 'blocked')),
  CONSTRAINT ck_gc_savings_op_blocked_shape CHECK (trust_status <> 'blocked' OR block_reason IS NOT NULL),
  CONSTRAINT ck_gc_savings_op_nonblocked_shape CHECK (
    trust_status = 'blocked'
    OR (
      candidate_catalog_product_id IS NOT NULL
      AND substitution_candidate_id IS NOT NULL
      AND source_unit_price_normalized IS NOT NULL
      AND candidate_unit_price_normalized IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_gc_savings_op_line_substitution_active
  ON gc_commerce.savings_opportunities (source_invoice_line_id, substitution_candidate_id)
  WHERE trust_status IN ('draft', 'rules_ok', 'operator_reviewed');

CREATE INDEX IF NOT EXISTS idx_gc_savings_op_company_status ON gc_commerce.savings_opportunities (company_id, trust_status);
CREATE INDEX IF NOT EXISTS idx_gc_savings_op_line ON gc_commerce.savings_opportunities (source_invoice_line_id);
CREATE INDEX IF NOT EXISTS idx_gc_savings_op_draft
  ON gc_commerce.savings_opportunities (company_id, created_at DESC)
  WHERE trust_status IN ('draft', 'rules_ok');

GRANT SELECT, INSERT, UPDATE, DELETE ON gc_commerce.glove_spec_groups TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON gc_commerce.glove_spec_group_members TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON gc_commerce.substitution_candidates TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON gc_commerce.savings_opportunities TO postgres, service_role;

COMMENT ON TABLE gc_commerce.savings_opportunities IS
  'Governed savings suggestions only; requires trusted lines, observations, approved spec+substitution, and UOM normalization.';
