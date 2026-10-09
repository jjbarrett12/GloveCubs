-- Launch ops: prospect statuses, invoice staff ops status, scoped invoice idempotency.

-- -----------------------------------------------------------------------------
-- sales_prospects: expand status vocabulary for storefront admin queue
-- -----------------------------------------------------------------------------
ALTER TABLE public.sales_prospects
  DROP CONSTRAINT IF EXISTS sales_prospects_status_check;

ALTER TABLE public.sales_prospects
  ADD CONSTRAINT sales_prospects_status_check CHECK (
    status IN (
      'new',
      'contacted',
      'qualified',
      'closed',
      'quoted',
      'negotiating',
      'won',
      'lost',
      'nurture'
    )
  );

COMMENT ON COLUMN public.sales_prospects.status IS
  'Staff workflow: new | contacted | qualified | closed (plus legacy quoted/negotiating/won/lost/nurture).';

-- -----------------------------------------------------------------------------
-- uploaded_invoices: staff ops status + scoped idempotency owner
-- -----------------------------------------------------------------------------
ALTER TABLE gc_commerce.uploaded_invoices
  ADD COLUMN IF NOT EXISTS staff_ops_status TEXT NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS idempotency_scope TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uploaded_invoices_staff_ops_status_check'
  ) THEN
    ALTER TABLE gc_commerce.uploaded_invoices
      ADD CONSTRAINT uploaded_invoices_staff_ops_status_check CHECK (
        staff_ops_status IN ('new', 'reviewing', 'handled')
      );
  END IF;
END $$;

-- Backfill scope from existing ownership columns before unique index change.
UPDATE gc_commerce.uploaded_invoices
SET idempotency_scope = CASE
  WHEN company_id IS NOT NULL THEN 'company:' || company_id::text
  WHEN created_by_user_id IS NOT NULL THEN 'user:' || created_by_user_id::text
  WHEN anonymous_session_id IS NOT NULL AND btrim(anonymous_session_id) <> '' THEN 'anon:' || btrim(anonymous_session_id)
  ELSE 'legacy:' || id::text
END
WHERE idempotency_scope IS NULL;

DROP INDEX IF EXISTS gc_commerce.idx_gc_uploaded_invoices_idempotency_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_gc_uploaded_invoices_scope_idempotency
  ON gc_commerce.uploaded_invoices (idempotency_scope, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND idempotency_scope IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gc_uploaded_invoices_staff_ops
  ON gc_commerce.uploaded_invoices (staff_ops_status, created_at DESC);

COMMENT ON COLUMN gc_commerce.uploaded_invoices.idempotency_scope IS
  'Tenant/session ownership boundary for idempotency (company:|user:|anon:|legacy:).';

COMMENT ON COLUMN gc_commerce.uploaded_invoices.staff_ops_status IS
  'Admin inbox workflow: new | reviewing | handled.';

-- -----------------------------------------------------------------------------
-- procurement_opportunities: scoped idempotency (mirror intake)
-- -----------------------------------------------------------------------------
ALTER TABLE public.procurement_opportunities
  ADD COLUMN IF NOT EXISTS idempotency_scope TEXT;

UPDATE public.procurement_opportunities po
SET idempotency_scope = COALESCE(
  (
    SELECT ui.idempotency_scope
    FROM gc_commerce.uploaded_invoices ui
    WHERE ui.procurement_opportunity_id = po.id
      AND ui.idempotency_scope IS NOT NULL
    LIMIT 1
  ),
  CASE
    WHEN po.idempotency_key IS NOT NULL THEN 'legacy:' || po.id::text
    ELSE NULL
  END
)
WHERE po.idempotency_scope IS NULL
  AND po.idempotency_key IS NOT NULL;

DROP INDEX IF EXISTS public.idx_procurement_opportunities_idempotency;

CREATE UNIQUE INDEX IF NOT EXISTS idx_procurement_opportunities_scope_idempotency
  ON public.procurement_opportunities (idempotency_scope, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND idempotency_scope IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Self-signup finalize lock (prevents concurrent double-company provisioning)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gc_commerce.self_signup_finalize_locks (
  user_id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE gc_commerce.self_signup_finalize_locks IS
  'Per-user claim during self-signup finalize to avoid concurrent duplicate companies.';

REVOKE ALL ON TABLE gc_commerce.self_signup_finalize_locks FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE gc_commerce.self_signup_finalize_locks TO service_role;
