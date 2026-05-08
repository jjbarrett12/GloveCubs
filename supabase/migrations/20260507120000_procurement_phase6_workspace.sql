-- Phase 6: internal procurement workspace — lifecycle, reorder memory (no customer UI).

-- Collapse legacy rules_ok into draft (never materialized in builder inserts, safe for any legacy rows).
UPDATE gc_commerce.savings_opportunities SET trust_status = 'draft' WHERE trust_status = 'rules_ok';

ALTER TABLE gc_commerce.savings_opportunities DROP CONSTRAINT IF EXISTS ck_gc_savings_op_trust;

ALTER TABLE gc_commerce.savings_opportunities
  ADD CONSTRAINT ck_gc_savings_op_trust CHECK (
    trust_status IN (
      'draft',
      'operator_reviewed',
      'approved_for_customer',
      'rejected',
      'archived',
      'blocked'
    )
  );

ALTER TABLE gc_commerce.savings_opportunities
  ADD COLUMN IF NOT EXISTS approved_for_customer_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_for_customer_by UUID,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by UUID,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by UUID,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT;

DROP INDEX IF EXISTS gc_commerce.uq_gc_savings_op_line_substitution_active;

CREATE UNIQUE INDEX IF NOT EXISTS uq_gc_savings_op_line_substitution_active
  ON gc_commerce.savings_opportunities (source_invoice_line_id, substitution_candidate_id)
  WHERE trust_status IN ('draft', 'operator_reviewed', 'approved_for_customer');

DROP INDEX IF EXISTS gc_commerce.idx_gc_savings_op_draft;

CREATE INDEX IF NOT EXISTS idx_gc_savings_op_active_queue
  ON gc_commerce.savings_opportunities (company_id, created_at DESC)
  WHERE trust_status IN ('draft', 'operator_reviewed');

-- -----------------------------------------------------------------------------
-- gc_commerce.procurement_reorder_memory (operator-curated; no auto-reorder)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gc_commerce.procurement_reorder_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES gc_commerce.companies (id) ON DELETE CASCADE,
  catalog_product_id UUID NOT NULL,
  promoted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  promoted_by UUID,
  decision_source TEXT NOT NULL DEFAULT 'operator',
  basis_uom TEXT NOT NULL,
  last_trusted_unit_basis NUMERIC(14, 6),
  valid_to TIMESTAMPTZ,
  notes TEXT,
  source_savings_opportunity_id UUID REFERENCES gc_commerce.savings_opportunities (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_gc_reorder_memory_decision CHECK (decision_source IN ('operator', 'system'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_gc_reorder_memory_active_company_product
  ON gc_commerce.procurement_reorder_memory (company_id, catalog_product_id)
  WHERE valid_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_gc_reorder_memory_company ON gc_commerce.procurement_reorder_memory (company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON gc_commerce.procurement_reorder_memory TO postgres, service_role;

COMMENT ON TABLE gc_commerce.procurement_reorder_memory IS
  'Internal reorder reference memory; promotion requires governed approved savings opportunity.';
