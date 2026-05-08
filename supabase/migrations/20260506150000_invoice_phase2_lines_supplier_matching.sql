-- Phase 2: durable invoice lines + supplier match + aggregate intake state for procurement memory.
-- Relational invoice_lines are canonical for matched/normalized truth; payload.last_extract is a raw artifact only.

-- -----------------------------------------------------------------------------
-- gc_commerce.invoice_lines
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gc_commerce.invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_invoice_id UUID NOT NULL REFERENCES gc_commerce.uploaded_invoices (id) ON DELETE CASCADE,
  line_index INT NOT NULL,
  raw_description TEXT NOT NULL DEFAULT '',
  quantity NUMERIC(14, 4) NOT NULL DEFAULT 0,
  unit_price NUMERIC(14, 4),
  line_total NUMERIC(14, 4),
  supplier_sku TEXT,
  extraction_confidence NUMERIC(6, 4),
  review_status TEXT NOT NULL DEFAULT 'pending_review',
  normalized_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  catalog_product_id UUID,
  match_confidence NUMERIC(6, 4),
  match_reason TEXT,
  substitute_candidate BOOLEAN NOT NULL DEFAULT false,
  human_decision TEXT,
  human_decided_at TIMESTAMPTZ,
  human_decided_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_gc_invoice_lines_uploaded_index UNIQUE (uploaded_invoice_id, line_index),
  CONSTRAINT ck_gc_invoice_lines_review_status CHECK (
    review_status IN (
      'pending_review',
      'review_required',
      'no_match',
      'ambiguous',
      'approved',
      'rejected'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_gc_invoice_lines_uploaded ON gc_commerce.invoice_lines (uploaded_invoice_id);
CREATE INDEX IF NOT EXISTS idx_gc_invoice_lines_review ON gc_commerce.invoice_lines (review_status);
CREATE INDEX IF NOT EXISTS idx_gc_invoice_lines_catalog_product ON gc_commerce.invoice_lines (catalog_product_id)
  WHERE catalog_product_id IS NOT NULL;

COMMENT ON TABLE gc_commerce.invoice_lines IS
  'Canonical structured invoice line memory; matcher output and normalization live here—not only in uploaded_invoices.payload.';

-- -----------------------------------------------------------------------------
-- gc_commerce.invoice_supplier_matches (one row per intake in Phase 2)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gc_commerce.invoice_supplier_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_invoice_id UUID NOT NULL REFERENCES gc_commerce.uploaded_invoices (id) ON DELETE CASCADE,
  vendor_raw TEXT NOT NULL DEFAULT '',
  normalized_vendor_key TEXT,
  catalogos_supplier_id UUID,
  confidence NUMERIC(6, 4),
  method TEXT NOT NULL DEFAULT 'none',
  review_status TEXT NOT NULL DEFAULT 'pending_review',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_gc_invoice_supplier_matches_uploaded UNIQUE (uploaded_invoice_id),
  CONSTRAINT ck_gc_invoice_supplier_review CHECK (
    review_status IN ('pending_review', 'review_required', 'ambiguous', 'no_match', 'approved', 'rejected')
  ),
  CONSTRAINT ck_gc_invoice_supplier_method CHECK (
    method IN ('exact_ilike', 'fuzzy_ilike', 'manual', 'none')
  )
);

CREATE INDEX IF NOT EXISTS idx_gc_invoice_supplier_matches_supplier ON gc_commerce.invoice_supplier_matches (catalogos_supplier_id)
  WHERE catalogos_supplier_id IS NOT NULL;

COMMENT ON TABLE gc_commerce.invoice_supplier_matches IS
  'Durable supplier resolution for an invoice intake; links to catalogos.suppliers when resolved.';

-- -----------------------------------------------------------------------------
-- uploaded_invoices aggregates + reprocessing
-- -----------------------------------------------------------------------------
ALTER TABLE gc_commerce.uploaded_invoices
  ADD COLUMN IF NOT EXISTS aggregate_review_status TEXT,
  ADD COLUMN IF NOT EXISTS line_count_persisted INT,
  ADD COLUMN IF NOT EXISTS matching_version TEXT,
  ADD COLUMN IF NOT EXISTS matching_attempt INT NOT NULL DEFAULT 0;

DO $agg$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_gc_uploaded_invoices_aggregate_review'
      AND conrelid = 'gc_commerce.uploaded_invoices'::regclass
  ) THEN
    ALTER TABLE gc_commerce.uploaded_invoices
      ADD CONSTRAINT ck_gc_uploaded_invoices_aggregate_review CHECK (
        aggregate_review_status IS NULL
        OR aggregate_review_status IN (
          'pending_review',
          'review_required',
          'no_match',
          'ambiguous',
          'cleared'
        )
      );
  END IF;
END
$agg$;

CREATE INDEX IF NOT EXISTS idx_gc_uploaded_invoices_aggregate_review
  ON gc_commerce.uploaded_invoices (aggregate_review_status)
  WHERE aggregate_review_status IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON gc_commerce.invoice_lines TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON gc_commerce.invoice_supplier_matches TO postgres, service_role;
