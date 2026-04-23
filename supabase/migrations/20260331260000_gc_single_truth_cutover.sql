-- =============================================================================
-- GloveCubs: single commerce truth in gc_commerce (greenfield / no legacy data).
-- Adds commercial columns on gc companies, subsidiary tables, UUID app_admins,
-- drops duplicate public commerce tables used by the Node app.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Companies: pricing + net terms + AR (single table, no public.companies)
-- -----------------------------------------------------------------------------
ALTER TABLE gc_commerce.companies
  ADD COLUMN IF NOT EXISTS default_gross_margin_percent NUMERIC(8,4) NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS net_terms_status TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS outstanding_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invoice_terms_code TEXT,
  ADD COLUMN IF NOT EXISTS invoice_terms_custom TEXT,
  ADD COLUMN IF NOT EXISTS invoice_orders_allowed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS net_terms_internal_notes TEXT,
  ADD COLUMN IF NOT EXISTS net_terms_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS net_terms_reviewed_by_user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_gc_companies_net_terms_status') THEN
    ALTER TABLE gc_commerce.companies
      ADD CONSTRAINT ck_gc_companies_net_terms_status CHECK (
        net_terms_status IN ('legacy', 'pending', 'approved', 'denied', 'on_hold', 'revoked')
      );
  END IF;
END $$;

COMMENT ON COLUMN gc_commerce.companies.default_gross_margin_percent IS 'B2B default gross margin %; single source for pricing context.';
COMMENT ON COLUMN gc_commerce.companies.outstanding_balance IS 'AR running balance (Net30); updated by invoice RPCs.';

DROP VIEW IF EXISTS gc_commerce.v_company_commercial;

-- -----------------------------------------------------------------------------
-- 2) Ship-to, lists, RFQs, uploaded invoices (UUID FKs only)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gc_commerce.ship_to_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES gc_commerce.companies (id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  label TEXT,
  address JSONB NOT NULL DEFAULT '{}'::JSONB,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gc_ship_to_company ON gc_commerce.ship_to_addresses (company_id);
CREATE INDEX IF NOT EXISTS idx_gc_ship_to_creator ON gc_commerce.ship_to_addresses (created_by_user_id);

CREATE TABLE IF NOT EXISTS gc_commerce.saved_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name TEXT,
  items JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gc_saved_lists_user ON gc_commerce.saved_lists (user_id);

CREATE TABLE IF NOT EXISTS gc_commerce.rfqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES gc_commerce.companies (id) ON DELETE SET NULL,
  created_by_user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gc_rfqs_company ON gc_commerce.rfqs (company_id);
CREATE INDEX IF NOT EXISTS idx_gc_rfqs_creator ON gc_commerce.rfqs (created_by_user_id);

CREATE TABLE IF NOT EXISTS gc_commerce.uploaded_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES gc_commerce.companies (id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gc_uploaded_invoices_company ON gc_commerce.uploaded_invoices (company_id);

-- -----------------------------------------------------------------------------
-- 3) Manufacturer margin overrides (UUID company_id)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gc_commerce.customer_manufacturer_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES gc_commerce.companies (id) ON DELETE CASCADE,
  manufacturer_id BIGINT NOT NULL REFERENCES public.manufacturers (id) ON DELETE CASCADE,
  margin_percent NUMERIC(8,4) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_gc_cmp_company_mfr UNIQUE (company_id, manufacturer_id),
  CONSTRAINT ck_gc_cmp_margin CHECK (margin_percent >= 0 AND margin_percent < 100)
);

CREATE INDEX IF NOT EXISTS idx_gc_cmp_company ON gc_commerce.customer_manufacturer_pricing (company_id);

-- -----------------------------------------------------------------------------
-- 4) Net terms applications (UUID throughout)
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.net_terms_applications CASCADE;

CREATE TABLE gc_commerce.net_terms_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES gc_commerce.companies (id) ON DELETE CASCADE,
  applicant_user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  business_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  billing_address_line1 TEXT,
  billing_city TEXT,
  billing_state TEXT,
  billing_zip TEXT,
  ein_tax_id TEXT,
  years_in_business TEXT,
  requested_credit_limit NUMERIC(14,2),
  monthly_estimated_spend NUMERIC(14,2),
  trade_references TEXT,
  tax_exempt BOOLEAN NOT NULL DEFAULT false,
  tax_certificate_note TEXT,
  reviewed_by_user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  decision_notes TEXT,
  approved_credit_limit NUMERIC(14,2),
  approved_invoice_terms_code TEXT,
  approved_invoice_orders_allowed BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_gc_nta_status CHECK (status IN ('pending', 'approved', 'denied', 'on_hold', 'revoked'))
);

CREATE INDEX IF NOT EXISTS idx_gc_nta_company ON gc_commerce.net_terms_applications (company_id);
CREATE INDEX IF NOT EXISTS idx_gc_nta_status ON gc_commerce.net_terms_applications (status);

GRANT SELECT, INSERT, UPDATE, DELETE ON gc_commerce.net_terms_applications TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON gc_commerce.ship_to_addresses TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON gc_commerce.saved_lists TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON gc_commerce.rfqs TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON gc_commerce.uploaded_invoices TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON gc_commerce.customer_manufacturer_pricing TO postgres, service_role;

-- -----------------------------------------------------------------------------
-- 5) Drop duplicate / legacy commerce tables (Node app must use gc only)
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.company_members CASCADE;
DROP TABLE IF EXISTS public.customer_manufacturer_pricing CASCADE;

-- app_admins: authority = auth UUID only
DROP TABLE IF EXISTS public.app_admins CASCADE;
CREATE TABLE public.app_admins (
  auth_user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_admins_email_lower ON public.app_admins (LOWER(email));
COMMENT ON TABLE public.app_admins IS 'Admin API access; keyed by Supabase Auth user id only.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_admins TO postgres, service_role;

-- Optional: remove legacy company bridge (commerce no longer uses public.companies)
DROP TABLE IF EXISTS gc_commerce.legacy_company_map CASCADE;
