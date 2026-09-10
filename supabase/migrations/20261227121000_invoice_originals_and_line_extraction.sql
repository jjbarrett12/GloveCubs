-- Phase 1 invoice originals + structured extraction fields (additive only).
-- Private storage for original invoice bytes; never a public bucket URL.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'invoice-originals',
  'invoice-originals',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- No anon/authenticated SELECT on invoice originals. Service role only.
DROP POLICY IF EXISTS "invoice_originals_public_read" ON storage.objects;
DROP POLICY IF EXISTS "invoice_originals_anon_read" ON storage.objects;
DROP POLICY IF EXISTS "invoice_originals_authenticated_read" ON storage.objects;

ALTER TABLE gc_commerce.uploaded_invoices
  ADD COLUMN IF NOT EXISTS storage_bucket TEXT,
  ADD COLUMN IF NOT EXISTS storage_object_path TEXT,
  ADD COLUMN IF NOT EXISTS invoice_date DATE,
  ADD COLUMN IF NOT EXISTS po_number TEXT,
  ADD COLUMN IF NOT EXISTS subtotal NUMERIC(14, 4),
  ADD COLUMN IF NOT EXISTS discounts NUMERIC(14, 4),
  ADD COLUMN IF NOT EXISTS freight NUMERIC(14, 4),
  ADD COLUMN IF NOT EXISTS tax NUMERIC(14, 4);

COMMENT ON COLUMN gc_commerce.uploaded_invoices.storage_object_path IS
  'Private invoice-originals object key: {company_id|anonymous}/{intake_id}/{sha256}.{ext}. Not a public URL.';
COMMENT ON COLUMN gc_commerce.uploaded_invoices.invoice_date IS
  'Business invoice date from the document. NULL when unknown. Never the upload timestamp.';

ALTER TABLE gc_commerce.invoice_lines
  ADD COLUMN IF NOT EXISTS quantity_uom TEXT,
  ADD COLUMN IF NOT EXISTS gloves_per_box NUMERIC(14, 4),
  ADD COLUMN IF NOT EXISTS boxes_per_case NUMERIC(14, 4),
  ADD COLUMN IF NOT EXISTS gloves_per_case NUMERIC(14, 4),
  ADD COLUMN IF NOT EXISTS pack_notation TEXT,
  ADD COLUMN IF NOT EXISTS manufacturer_sku TEXT,
  ADD COLUMN IF NOT EXISTS field_provenance JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $uom$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_gc_invoice_lines_quantity_uom'
      AND conrelid = 'gc_commerce.invoice_lines'::regclass
  ) THEN
    ALTER TABLE gc_commerce.invoice_lines
      ADD CONSTRAINT ck_gc_invoice_lines_quantity_uom CHECK (
        quantity_uom IS NULL OR quantity_uom IN ('EA', 'BX', 'CS')
      );
  END IF;
END
$uom$;

COMMENT ON COLUMN gc_commerce.invoice_lines.field_provenance IS
  'Per-field source: invoice | parsed | ai_inferred | catalog | operator. Prevents inferred values from becoming trusted fact.';
COMMENT ON COLUMN gc_commerce.invoice_lines.quantity_uom IS
  'Purchased unit of measure (EA/BX/CS). NULL when unknown; do not infer savings from unknown UoM.';
