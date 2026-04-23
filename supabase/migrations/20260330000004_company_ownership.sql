-- =============================================================================
-- Company ownership: Add company_id, created_by_user_id to commercial records.
-- Moves orders, rfqs, ship_to_addresses, uploaded_invoices from user-scoped
-- to company-scoped ownership while preserving user attribution.
-- =============================================================================

-- Orders: company owns; created_by tracks who placed it
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS company_id BIGINT REFERENCES companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by_user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL;

-- RFQs: company owns; created_by tracks submitter
ALTER TABLE public.rfqs
  ADD COLUMN IF NOT EXISTS company_id BIGINT REFERENCES companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by_user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL;

-- Ship-to addresses: company owns; created_by tracks who added it
ALTER TABLE public.ship_to_addresses
  ADD COLUMN IF NOT EXISTS company_id BIGINT REFERENCES companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by_user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL;

-- Uploaded invoices: company owns; created_by tracks uploader
ALTER TABLE public.uploaded_invoices
  ADD COLUMN IF NOT EXISTS company_id BIGINT REFERENCES companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by_user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL;

-- Indexes for company-scoped queries
CREATE INDEX IF NOT EXISTS idx_orders_company ON public.orders (company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rfqs_company ON public.rfqs (company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ship_to_company ON public.ship_to_addresses (company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_uploaded_invoices_company ON public.uploaded_invoices (company_id) WHERE company_id IS NOT NULL;

-- Backfill: set company_id and created_by_user_id from existing user_id
-- Orders: user_id -> created_by_user_id; company_id from users.company_id or company_name match
UPDATE public.orders o
SET
  created_by_user_id = o.user_id,
  company_id = COALESCE(
    (SELECT u.company_id FROM public.users u WHERE u.id = o.user_id),
    (SELECT c.id FROM public.companies c
     JOIN public.users u ON u.id = o.user_id
     WHERE LOWER(TRIM(c.name)) = LOWER(TRIM(COALESCE(u.company_name, '')))
     LIMIT 1)
  )
WHERE o.created_by_user_id IS NULL AND o.user_id IS NOT NULL;

-- RFQs: user_id -> created_by_user_id; company_id from users
UPDATE public.rfqs r
SET
  created_by_user_id = r.user_id,
  company_id = COALESCE(
    (SELECT u.company_id FROM public.users u WHERE u.id = r.user_id),
    (SELECT c.id FROM public.companies c
     JOIN public.users u ON u.id = r.user_id
     WHERE LOWER(TRIM(c.name)) = LOWER(TRIM(COALESCE(u.company_name, '')))
     LIMIT 1)
  )
WHERE r.created_by_user_id IS NULL AND r.user_id IS NOT NULL;

-- Ship-to: user_id -> created_by_user_id; company_id from users
UPDATE public.ship_to_addresses s
SET
  created_by_user_id = s.user_id,
  company_id = COALESCE(
    (SELECT u.company_id FROM public.users u WHERE u.id = s.user_id),
    (SELECT c.id FROM public.companies c
     JOIN public.users u ON u.id = s.user_id
     WHERE LOWER(TRIM(c.name)) = LOWER(TRIM(COALESCE(u.company_name, '')))
     LIMIT 1)
  )
WHERE s.created_by_user_id IS NULL AND s.user_id IS NOT NULL;

-- Uploaded invoices: user_id -> created_by_user_id; company_id from users
UPDATE public.uploaded_invoices ui
SET
  created_by_user_id = ui.user_id,
  company_id = COALESCE(
    (SELECT u.company_id FROM public.users u WHERE u.id = ui.user_id),
    (SELECT c.id FROM public.companies c
     JOIN public.users u ON u.id = ui.user_id
     WHERE LOWER(TRIM(c.name)) = LOWER(TRIM(COALESCE(u.company_name, '')))
     LIMIT 1)
  )
WHERE ui.created_by_user_id IS NULL AND ui.user_id IS NOT NULL;

COMMENT ON COLUMN public.orders.company_id IS 'Company that owns the order; access controlled by company membership.';
COMMENT ON COLUMN public.orders.created_by_user_id IS 'User who placed the order; kept for attribution.';
COMMENT ON COLUMN public.rfqs.company_id IS 'Company that owns the RFQ; access controlled by company membership.';
COMMENT ON COLUMN public.rfqs.created_by_user_id IS 'User who submitted the RFQ.';
COMMENT ON COLUMN public.ship_to_addresses.company_id IS 'Company that owns the address; shared across company members.';
COMMENT ON COLUMN public.ship_to_addresses.created_by_user_id IS 'User who added the address.';
COMMENT ON COLUMN public.uploaded_invoices.company_id IS 'Company that owns the invoice; shared across company members.';
COMMENT ON COLUMN public.uploaded_invoices.created_by_user_id IS 'User who uploaded the invoice.';
