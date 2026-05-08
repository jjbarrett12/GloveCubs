-- Phase 1: invoice intake — durable gc_commerce.uploaded_invoices + procurement spine anchors.
-- Additive only; supports anonymous uploads (nullable created_by_user_id).

ALTER TABLE gc_commerce.uploaded_invoices
  ADD COLUMN IF NOT EXISTS content_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS intake_status TEXT NOT NULL DEFAULT 'received',
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS original_filename TEXT,
  ADD COLUMN IF NOT EXISTS byte_size BIGINT,
  ADD COLUMN IF NOT EXISTS extraction_model TEXT,
  ADD COLUMN IF NOT EXISTS extraction_version TEXT,
  ADD COLUMN IF NOT EXISTS extracted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS extraction_error TEXT,
  ADD COLUMN IF NOT EXISTS procurement_opportunity_id UUID,
  ADD COLUMN IF NOT EXISTS anonymous_session_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uploaded_invoices_intake_status_check'
      AND conrelid = 'gc_commerce.uploaded_invoices'::regclass
  ) THEN
    ALTER TABLE gc_commerce.uploaded_invoices
      ADD CONSTRAINT uploaded_invoices_intake_status_check CHECK (
        intake_status IN (
          'received',
          'extracting',
          'extracted_ok',
          'extracted_failed',
          'intake_failed'
        )
      );
  END IF;
END $$;

DO $fk$
BEGIN
  ALTER TABLE gc_commerce.uploaded_invoices
    ADD CONSTRAINT fk_gc_uploaded_invoices_procurement_opportunity
      FOREIGN KEY (procurement_opportunity_id)
      REFERENCES public.procurement_opportunities (id)
      ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$fk$;

ALTER TABLE gc_commerce.uploaded_invoices
  ALTER COLUMN created_by_user_id DROP NOT NULL;

COMMENT ON COLUMN gc_commerce.uploaded_invoices.intake_status IS
  'Invoice intake lifecycle: received → extracting → extracted_ok|extracted_failed|intake_failed';

CREATE UNIQUE INDEX IF NOT EXISTS idx_gc_uploaded_invoices_company_sha256
  ON gc_commerce.uploaded_invoices (company_id, content_sha256)
  WHERE company_id IS NOT NULL AND content_sha256 IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_gc_uploaded_invoices_idempotency_key
  ON gc_commerce.uploaded_invoices (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gc_uploaded_invoices_procurement_opportunity
  ON gc_commerce.uploaded_invoices (procurement_opportunity_id)
  WHERE procurement_opportunity_id IS NOT NULL;
