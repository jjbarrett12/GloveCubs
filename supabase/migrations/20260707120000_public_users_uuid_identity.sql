-- =============================================================================
-- Identity cutover: public.users.id = auth.users.id (UUID).
-- Merges gc_commerce.user_profiles into public.users; drops legacy_user_map.
-- Converts public (and selected) BIGINT user FKs using legacy_user_map before drop.
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'users'
      AND c.column_name = 'id'
      AND c.data_type = 'uuid'
  ) THEN
    RAISE EXCEPTION '20260707120000_public_users_uuid_identity: already applied (public.users.id is uuid)';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public._mig_legacy_uid_to_auth(p_legacy BIGINT)
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT m.auth_user_id
  FROM gc_commerce.legacy_user_map m
  WHERE m.legacy_user_id = p_legacy
  LIMIT 1;
$$;

ALTER TABLE public.users RENAME TO users_legacy_bigint;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname AS cname, n.nspname AS sch, cl.relname AS tbl
    FROM pg_constraint c
    JOIN pg_class cl ON cl.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.users_legacy_bigint'::regclass
  LOOP
    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', r.sch, r.tbl, r.cname);
  END LOOP;
END $$;

CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  company_name TEXT,
  company_id UUID REFERENCES gc_commerce.companies (id) ON DELETE SET NULL,
  contact_name TEXT,
  phone TEXT,
  phone_e164 TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  is_approved SMALLINT NOT NULL DEFAULT 0,
  discount_tier TEXT NOT NULL DEFAULT 'standard',
  pricing_tier_source TEXT NOT NULL DEFAULT 'manual',
  pricing_tier_evaluated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  budget_amount NUMERIC(12, 2),
  budget_period TEXT DEFAULT 'monthly',
  rep_name TEXT,
  rep_email TEXT,
  rep_phone TEXT,
  cases_or_pallets TEXT,
  allow_free_upgrades BOOLEAN DEFAULT false,
  payment_terms TEXT DEFAULT 'credit_card',
  CONSTRAINT users_pricing_tier_source_check CHECK (pricing_tier_source IN ('auto', 'manual'))
);

CREATE UNIQUE INDEX uq_public_users_email_lower ON public.users (LOWER(TRIM(email)));

COMMENT ON TABLE public.users IS 'B2B portal profile; PK = Supabase Auth user id.';

INSERT INTO public.users (
  id,
  email,
  password_hash,
  company_name,
  company_id,
  contact_name,
  phone,
  phone_e164,
  address,
  city,
  state,
  zip,
  is_approved,
  discount_tier,
  pricing_tier_source,
  pricing_tier_evaluated_at,
  created_at,
  updated_at,
  budget_amount,
  budget_period,
  rep_name,
  rep_email,
  rep_phone,
  cases_or_pallets,
  allow_free_upgrades,
  payment_terms
)
SELECT
  m.auth_user_id,
  LOWER(TRIM(l.email)),
  l.password_hash,
  l.company_name,
  up.default_company_id,
  COALESCE(NULLIF(TRIM(up.full_name), ''), l.contact_name),
  COALESCE(l.phone, up.phone_e164),
  up.phone_e164,
  l.address,
  l.city,
  l.state,
  l.zip,
  l.is_approved,
  l.discount_tier,
  COALESCE(NULLIF(TRIM(l.pricing_tier_source), ''), 'manual'),
  l.pricing_tier_evaluated_at,
  l.created_at,
  l.updated_at,
  l.budget_amount,
  l.budget_period,
  l.rep_name,
  l.rep_email,
  l.rep_phone,
  l.cases_or_pallets,
  l.allow_free_upgrades,
  l.payment_terms
FROM public.users_legacy_bigint l
INNER JOIN gc_commerce.legacy_user_map m ON m.legacy_user_id = l.id
LEFT JOIN gc_commerce.user_profiles up ON up.user_id = m.auth_user_id
ON CONFLICT (id) DO NOTHING;

-- Profile-only auth users (placeholder bcrypt = "password" — rotate if any row appears)
INSERT INTO public.users (
  id,
  email,
  password_hash,
  company_name,
  company_id,
  contact_name,
  phone,
  phone_e164,
  is_approved,
  discount_tier,
  pricing_tier_source,
  created_at,
  updated_at
)
SELECT
  up.user_id,
  LOWER(TRIM(au.email)),
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
  NULL,
  up.default_company_id,
  up.full_name,
  NULL,
  up.phone_e164,
  0,
  'standard',
  'manual',
  up.created_at,
  up.updated_at
FROM gc_commerce.user_profiles up
INNER JOIN auth.users au ON au.id = up.user_id
WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = up.user_id)
ON CONFLICT (id) DO NOTHING;

-- --- Child tables: BIGINT user columns → UUID --------------------------------
DO $$
BEGIN
  IF to_regclass('public.pricing_tier_audit_log') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'pricing_tier_audit_log' AND column_name = 'user_id' AND data_type = 'bigint'
     ) THEN
    DELETE FROM public.pricing_tier_audit_log a
    WHERE NOT EXISTS (SELECT 1 FROM gc_commerce.legacy_user_map m WHERE m.legacy_user_id = a.user_id);
    ALTER TABLE public.pricing_tier_audit_log
      ALTER COLUMN user_id TYPE UUID USING (public._mig_legacy_uid_to_auth(user_id));
    ALTER TABLE public.pricing_tier_audit_log
      ADD CONSTRAINT pricing_tier_audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.product_favorites') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'product_favorites' AND column_name = 'user_id' AND data_type = 'bigint'
     ) THEN
    DELETE FROM public.product_favorites f
    WHERE NOT EXISTS (SELECT 1 FROM gc_commerce.legacy_user_map m WHERE m.legacy_user_id = f.user_id);
    ALTER TABLE public.product_favorites
      ALTER COLUMN user_id TYPE UUID USING (public._mig_legacy_uid_to_auth(user_id));
    ALTER TABLE public.product_favorites
      ADD CONSTRAINT product_favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stock_history' AND column_name = 'user_id' AND data_type = 'bigint'
  ) THEN
    UPDATE public.stock_history sh
    SET user_id = NULL
    WHERE sh.user_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM gc_commerce.legacy_user_map m WHERE m.legacy_user_id = sh.user_id);
    ALTER TABLE public.stock_history
      ALTER COLUMN user_id TYPE UUID USING (
        CASE
          WHEN user_id IS NULL THEN NULL
          ELSE public._mig_legacy_uid_to_auth(user_id)
        END
      );
    ALTER TABLE public.stock_history
      ADD CONSTRAINT stock_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory' AND column_name = 'user_id' AND data_type = 'bigint'
  ) THEN
    UPDATE public.inventory inv
    SET user_id = NULL
    WHERE inv.user_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM gc_commerce.legacy_user_map m WHERE m.legacy_user_id = inv.user_id);
    ALTER TABLE public.inventory
      ALTER COLUMN user_id TYPE UUID USING (
        CASE
          WHEN user_id IS NULL THEN NULL
          ELSE public._mig_legacy_uid_to_auth(user_id)
        END
      );
    ALTER TABLE public.inventory
      ADD CONSTRAINT inventory_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales_prospects' AND column_name = 'created_by_admin_user_id' AND data_type = 'bigint'
  ) THEN
    UPDATE public.sales_prospects g
    SET created_by_admin_user_id = NULL
    WHERE g.created_by_admin_user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM gc_commerce.legacy_user_map m WHERE m.legacy_user_id = g.created_by_admin_user_id
      );
    ALTER TABLE public.sales_prospects
      ALTER COLUMN created_by_admin_user_id TYPE UUID USING (
        CASE
          WHEN created_by_admin_user_id IS NULL THEN NULL
          ELSE public._mig_legacy_uid_to_auth(created_by_admin_user_id)
        END
      );
    ALTER TABLE public.sales_prospects
      ADD CONSTRAINT sales_prospects_created_by_admin_fkey FOREIGN KEY (created_by_admin_user_id) REFERENCES public.users (id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'supplier_cost_import_runs' AND column_name = 'admin_user_id' AND data_type = 'bigint'
  ) THEN
    UPDATE public.supplier_cost_import_runs r
    SET admin_user_id = NULL
    WHERE r.admin_user_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM gc_commerce.legacy_user_map m WHERE m.legacy_user_id = r.admin_user_id);
    ALTER TABLE public.supplier_cost_import_runs
      ALTER COLUMN admin_user_id TYPE UUID USING (
        CASE
          WHEN admin_user_id IS NULL THEN NULL
          ELSE public._mig_legacy_uid_to_auth(admin_user_id)
        END
      );
    ALTER TABLE public.supplier_cost_import_runs
      ADD CONSTRAINT supplier_cost_import_runs_admin_fkey FOREIGN KEY (admin_user_id) REFERENCES public.users (id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.ar_invoice_payments') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'ar_invoice_payments' AND column_name = 'recorded_by_user_id' AND data_type = 'bigint'
     ) THEN
    UPDATE public.ar_invoice_payments p
    SET recorded_by_user_id = NULL
    WHERE p.recorded_by_user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM gc_commerce.legacy_user_map m WHERE m.legacy_user_id = p.recorded_by_user_id
      );
    ALTER TABLE public.ar_invoice_payments
      ALTER COLUMN recorded_by_user_id TYPE UUID USING (
        CASE
          WHEN recorded_by_user_id IS NULL THEN NULL
          ELSE public._mig_legacy_uid_to_auth(recorded_by_user_id)
        END
      );
    ALTER TABLE public.ar_invoice_payments
      ADD CONSTRAINT ar_invoice_payments_recorded_by_fkey FOREIGN KEY (recorded_by_user_id) REFERENCES public.users (id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'net_terms_reviewed_by_user_id' AND data_type = 'bigint'
  ) THEN
    UPDATE public.companies c
    SET net_terms_reviewed_by_user_id = NULL
    WHERE c.net_terms_reviewed_by_user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM gc_commerce.legacy_user_map m WHERE m.legacy_user_id = c.net_terms_reviewed_by_user_id
      );
    ALTER TABLE public.companies
      ALTER COLUMN net_terms_reviewed_by_user_id TYPE UUID USING (
        CASE
          WHEN net_terms_reviewed_by_user_id IS NULL THEN NULL
          ELSE public._mig_legacy_uid_to_auth(net_terms_reviewed_by_user_id)
        END
      );
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_net_terms_reviewed_by_fkey FOREIGN KEY (net_terms_reviewed_by_user_id) REFERENCES public.users (id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.net_terms_applications') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'net_terms_applications' AND column_name = 'applicant_user_id' AND data_type = 'bigint'
     ) THEN
    DELETE FROM public.net_terms_applications a
    WHERE NOT EXISTS (SELECT 1 FROM gc_commerce.legacy_user_map m WHERE m.legacy_user_id = a.applicant_user_id);
    ALTER TABLE public.net_terms_applications
      ALTER COLUMN applicant_user_id TYPE UUID USING (public._mig_legacy_uid_to_auth(applicant_user_id));
    UPDATE public.net_terms_applications a
    SET reviewed_by_user_id = NULL
    WHERE a.reviewed_by_user_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM gc_commerce.legacy_user_map m WHERE m.legacy_user_id = a.reviewed_by_user_id);
    ALTER TABLE public.net_terms_applications
      ALTER COLUMN reviewed_by_user_id TYPE UUID USING (
        CASE
          WHEN reviewed_by_user_id IS NULL THEN NULL
          ELSE public._mig_legacy_uid_to_auth(reviewed_by_user_id)
        END
      );
    ALTER TABLE public.net_terms_applications
      ADD CONSTRAINT nta_applicant_fkey FOREIGN KEY (applicant_user_id) REFERENCES public.users (id) ON DELETE CASCADE;
    ALTER TABLE public.net_terms_applications
      ADD CONSTRAINT nta_reviewed_by_fkey FOREIGN KEY (reviewed_by_user_id) REFERENCES public.users (id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.orders') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'user_id' AND data_type = 'bigint'
     ) THEN
    DELETE FROM public.orders o
    WHERE NOT EXISTS (SELECT 1 FROM gc_commerce.legacy_user_map m WHERE m.legacy_user_id = o.user_id);
    ALTER TABLE public.orders
      ALTER COLUMN user_id TYPE UUID USING (public._mig_legacy_uid_to_auth(user_id));
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.orders') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'created_by_user_id' AND data_type = 'bigint'
     ) THEN
    UPDATE public.orders o
    SET created_by_user_id = NULL
    WHERE o.created_by_user_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM gc_commerce.legacy_user_map m WHERE m.legacy_user_id = o.created_by_user_id);
    ALTER TABLE public.orders
      ALTER COLUMN created_by_user_id TYPE UUID USING (
        CASE
          WHEN created_by_user_id IS NULL THEN NULL
          ELSE public._mig_legacy_uid_to_auth(created_by_user_id)
        END
      );
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_created_by_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users (id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.rfqs') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'rfqs' AND column_name = 'user_id' AND data_type = 'bigint'
     ) THEN
    UPDATE public.rfqs r
    SET user_id = NULL
    WHERE r.user_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM gc_commerce.legacy_user_map m WHERE m.legacy_user_id = r.user_id);
    ALTER TABLE public.rfqs
      ALTER COLUMN user_id TYPE UUID USING (
        CASE
          WHEN user_id IS NULL THEN NULL
          ELSE public._mig_legacy_uid_to_auth(user_id)
        END
      );
    ALTER TABLE public.rfqs
      ADD CONSTRAINT rfqs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.rfqs') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'rfqs' AND column_name = 'created_by_user_id' AND data_type = 'bigint'
     ) THEN
    UPDATE public.rfqs r
    SET created_by_user_id = NULL
    WHERE r.created_by_user_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM gc_commerce.legacy_user_map m WHERE m.legacy_user_id = r.created_by_user_id);
    ALTER TABLE public.rfqs
      ALTER COLUMN created_by_user_id TYPE UUID USING (
        CASE
          WHEN created_by_user_id IS NULL THEN NULL
          ELSE public._mig_legacy_uid_to_auth(created_by_user_id)
        END
      );
    ALTER TABLE public.rfqs
      ADD CONSTRAINT rfqs_created_by_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users (id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.saved_lists') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'saved_lists' AND column_name = 'user_id' AND data_type = 'bigint'
     ) THEN
    DELETE FROM public.saved_lists s
    WHERE NOT EXISTS (SELECT 1 FROM gc_commerce.legacy_user_map m WHERE m.legacy_user_id = s.user_id);
    ALTER TABLE public.saved_lists
      ALTER COLUMN user_id TYPE UUID USING (public._mig_legacy_uid_to_auth(user_id));
    ALTER TABLE public.saved_lists
      ADD CONSTRAINT saved_lists_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.ship_to_addresses') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'ship_to_addresses' AND column_name = 'user_id' AND data_type = 'bigint'
     ) THEN
    DELETE FROM public.ship_to_addresses s
    WHERE NOT EXISTS (SELECT 1 FROM gc_commerce.legacy_user_map m WHERE m.legacy_user_id = s.user_id);
    ALTER TABLE public.ship_to_addresses
      ALTER COLUMN user_id TYPE UUID USING (public._mig_legacy_uid_to_auth(user_id));
    ALTER TABLE public.ship_to_addresses
      ADD CONSTRAINT ship_to_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.ship_to_addresses') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'ship_to_addresses' AND column_name = 'created_by_user_id' AND data_type = 'bigint'
     ) THEN
    UPDATE public.ship_to_addresses s
    SET created_by_user_id = NULL
    WHERE s.created_by_user_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM gc_commerce.legacy_user_map m WHERE m.legacy_user_id = s.created_by_user_id);
    ALTER TABLE public.ship_to_addresses
      ALTER COLUMN created_by_user_id TYPE UUID USING (
        CASE
          WHEN created_by_user_id IS NULL THEN NULL
          ELSE public._mig_legacy_uid_to_auth(created_by_user_id)
        END
      );
    ALTER TABLE public.ship_to_addresses
      ADD CONSTRAINT ship_to_created_by_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users (id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.uploaded_invoices') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'uploaded_invoices' AND column_name = 'user_id' AND data_type = 'bigint'
     ) THEN
    DELETE FROM public.uploaded_invoices u
    WHERE NOT EXISTS (SELECT 1 FROM gc_commerce.legacy_user_map m WHERE m.legacy_user_id = u.user_id);
    ALTER TABLE public.uploaded_invoices
      ALTER COLUMN user_id TYPE UUID USING (public._mig_legacy_uid_to_auth(user_id));
    ALTER TABLE public.uploaded_invoices
      ADD CONSTRAINT uploaded_invoices_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.uploaded_invoices') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'uploaded_invoices' AND column_name = 'created_by_user_id' AND data_type = 'bigint'
     ) THEN
    UPDATE public.uploaded_invoices u
    SET created_by_user_id = NULL
    WHERE u.created_by_user_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM gc_commerce.legacy_user_map m WHERE m.legacy_user_id = u.created_by_user_id);
    ALTER TABLE public.uploaded_invoices
      ALTER COLUMN created_by_user_id TYPE UUID USING (
        CASE
          WHEN created_by_user_id IS NULL THEN NULL
          ELSE public._mig_legacy_uid_to_auth(created_by_user_id)
        END
      );
    ALTER TABLE public.uploaded_invoices
      ADD CONSTRAINT uploaded_invoices_created_by_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users (id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.password_reset_tokens') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'password_reset_tokens' AND column_name = 'user_id' AND data_type = 'bigint'
     ) THEN
    DELETE FROM public.password_reset_tokens t
    WHERE NOT EXISTS (SELECT 1 FROM gc_commerce.legacy_user_map m WHERE m.legacy_user_id = t.user_id);
    ALTER TABLE public.password_reset_tokens
      ALTER COLUMN user_id TYPE UUID USING (public._mig_legacy_uid_to_auth(user_id));
    ALTER TABLE public.password_reset_tokens
      ADD CONSTRAINT password_reset_tokens_user_fkey FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'gc_commerce' AND table_name = 'ar_invoice_payments' AND column_name = 'recorded_by_legacy_user_id'
  ) THEN
    ALTER TABLE gc_commerce.ar_invoice_payments DROP COLUMN IF EXISTS recorded_by_legacy_user_id;
  END IF;
END $$;

DROP VIEW IF EXISTS gc_commerce.v_backfill_reconciliation;

DROP TABLE IF EXISTS public.users_legacy_bigint;

DROP TABLE IF EXISTS gc_commerce.legacy_user_map CASCADE;

DROP TABLE IF EXISTS gc_commerce.user_profiles CASCADE;

DROP FUNCTION IF EXISTS public._mig_legacy_uid_to_auth(BIGINT);

CREATE OR REPLACE VIEW gc_commerce.v_backfill_reconciliation AS
SELECT
  (
    SELECT bl.details
    FROM gc_commerce.backfill_log bl
    WHERE bl.phase = 'summary'
      AND bl.message = 'gc_commerce backfill reconciliation snapshot'
    ORDER BY bl.id DESC
    LIMIT 1
  ) AS last_run_summary,
  (SELECT COUNT(*) FROM public.users) AS live_legacy_public_users,
  (SELECT COUNT(*) FROM auth.users) AS live_gc_user_profiles,
  (SELECT COUNT(*) FROM public.orders) AS live_legacy_orders,
  (SELECT COUNT(*) FROM gc_commerce.legacy_order_map) AS live_mapped_orders,
  (SELECT COUNT(*) FROM public.order_items WHERE canonical_product_id IS NULL) AS live_order_items_missing_canonical,
  (SELECT COUNT(*) FROM gc_commerce.backfill_log WHERE severity = 'warning') AS total_backfill_warnings;

COMMENT ON VIEW gc_commerce.v_backfill_reconciliation IS
  'last_run_summary.details mirrors the latest summary backfill_log row; other columns are live counts. '
  'After UUID identity cutover, live_gc_user_profiles counts auth.users (gc_commerce.user_profiles was merged into public.users and dropped).';

GRANT SELECT ON gc_commerce.v_backfill_reconciliation TO postgres, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO postgres, service_role;
