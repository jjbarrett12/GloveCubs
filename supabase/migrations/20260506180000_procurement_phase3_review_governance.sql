-- Phase 3: operational governance + auditable operator decisions (additive only).

-- -----------------------------------------------------------------------------
-- gc_commerce.invoice_lines — audit + trust separation
-- -----------------------------------------------------------------------------
ALTER TABLE gc_commerce.invoice_lines
  ADD COLUMN IF NOT EXISTS review_notes TEXT,
  ADD COLUMN IF NOT EXISTS decision_source TEXT NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS resolution_reason TEXT;

DO $line_ds$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_gc_invoice_lines_decision_source'
      AND conrelid = 'gc_commerce.invoice_lines'::regclass
  ) THEN
    ALTER TABLE gc_commerce.invoice_lines
      ADD CONSTRAINT ck_gc_invoice_lines_decision_source CHECK (
        decision_source IN ('system', 'operator', 'rerun')
      );
  END IF;
END
$line_ds$;

DO $line_hd$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_gc_invoice_lines_human_decision'
      AND conrelid = 'gc_commerce.invoice_lines'::regclass
  ) THEN
    ALTER TABLE gc_commerce.invoice_lines
      ADD CONSTRAINT ck_gc_invoice_lines_human_decision CHECK (
        human_decision IS NULL
        OR human_decision IN ('approve', 'reject', 'assign', 'no_match', 'confirm_no_match')
      );
  END IF;
END
$line_hd$;

CREATE INDEX IF NOT EXISTS idx_gc_invoice_lines_review_queue
  ON gc_commerce.invoice_lines (uploaded_invoice_id, review_status)
  WHERE review_status IN ('pending_review', 'review_required', 'ambiguous', 'rejected');

CREATE INDEX IF NOT EXISTS idx_gc_invoice_lines_no_match_queue
  ON gc_commerce.invoice_lines (uploaded_invoice_id)
  WHERE review_status = 'no_match' AND (decision_source IS DISTINCT FROM 'operator' OR human_decided_at IS NULL);

-- -----------------------------------------------------------------------------
-- gc_commerce.invoice_supplier_matches — operator audit
-- -----------------------------------------------------------------------------
ALTER TABLE gc_commerce.invoice_supplier_matches
  ADD COLUMN IF NOT EXISTS reviewed_by UUID,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_notes TEXT,
  ADD COLUMN IF NOT EXISTS decision_source TEXT NOT NULL DEFAULT 'system';

DO $sup_ds$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_gc_invoice_supplier_decision_source'
      AND conrelid = 'gc_commerce.invoice_supplier_matches'::regclass
  ) THEN
    ALTER TABLE gc_commerce.invoice_supplier_matches
      ADD CONSTRAINT ck_gc_invoice_supplier_decision_source CHECK (
        decision_source IN ('system', 'operator', 'rerun')
      );
  END IF;
END
$sup_ds$;

CREATE INDEX IF NOT EXISTS idx_gc_invoice_supplier_matches_review_queue
  ON gc_commerce.invoice_supplier_matches (uploaded_invoice_id)
  WHERE review_status IN ('pending_review', 'review_required', 'ambiguous', 'no_match');

-- -----------------------------------------------------------------------------
-- gc_commerce.uploaded_invoices — concurrent rerun guard
-- -----------------------------------------------------------------------------
ALTER TABLE gc_commerce.uploaded_invoices
  ADD COLUMN IF NOT EXISTS matching_rerun_in_progress BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN gc_commerce.invoice_lines.decision_source IS
  'system = matcher/extraction; operator = human governance; rerun = automated rematch pass (non-trusted rows only).';
COMMENT ON COLUMN gc_commerce.invoice_lines.review_notes IS
  'Optional operator context; not used for matching.';
