-- =============================================================================
-- Phase 1 follow-on: company_id immutability, supplier job RLS, cost column grants.
-- Rollback: DROP TRIGGER/FUNCTION listed below; restore prior supplier_import_jobs
--   policy only if intentionally reopening (not recommended).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Immutable tenant keys on customer-owned rows
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION gc_commerce.reject_company_id_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = gc_commerce, public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'company_id is immutable after insert';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION gc_commerce.reject_company_id_change() IS
  'Blocks UPDATE that moves a row to another company_id (tenant key).';

REVOKE ALL ON FUNCTION gc_commerce.reject_company_id_change() FROM PUBLIC;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ship_to_addresses',
    'uploaded_invoices',
    'rfqs',
    'orders',
    'company_quicklist_items',
    'customer_manufacturer_pricing',
    'net_terms_applications'
  ]
  LOOP
    IF to_regclass('gc_commerce.' || t) IS NOT NULL THEN
      EXECUTE format(
        'DROP TRIGGER IF EXISTS trg_%s_company_id_immutable ON gc_commerce.%I',
        t, t
      );
      EXECUTE format(
        'CREATE TRIGGER trg_%s_company_id_immutable
           BEFORE UPDATE OF company_id ON gc_commerce.%I
           FOR EACH ROW
           EXECUTE FUNCTION gc_commerce.reject_company_id_change()',
        t, t
      );
    END IF;
  END LOOP;
END $$;

-- quote_requests use gc_company_id
CREATE OR REPLACE FUNCTION catalogos.reject_gc_company_id_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = catalogos, gc_commerce, public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.gc_company_id IS DISTINCT FROM OLD.gc_company_id THEN
    RAISE EXCEPTION 'gc_company_id is immutable after insert';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION catalogos.reject_gc_company_id_change() FROM PUBLIC;

DO $$
BEGIN
  IF to_regclass('catalogos.quote_requests') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_quote_requests_gc_company_id_immutable ON catalogos.quote_requests;
    CREATE TRIGGER trg_quote_requests_gc_company_id_immutable
      BEFORE UPDATE OF gc_company_id ON catalogos.quote_requests
      FOR EACH ROW
      EXECUTE FUNCTION catalogos.reject_gc_company_id_change();
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- sellable_products: authenticated may read catalog fields, not unit_cost_minor
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'gc_commerce'
      AND table_name = 'sellable_products'
      AND column_name = 'unit_cost_minor'
  ) THEN
    EXECUTE 'REVOKE SELECT (unit_cost_minor) ON TABLE gc_commerce.sellable_products FROM authenticated';
    EXECUTE 'REVOKE SELECT (unit_cost_minor) ON TABLE gc_commerce.sellable_products FROM anon';
    EXECUTE 'REVOKE SELECT (unit_cost_minor) ON TABLE gc_commerce.sellable_products FROM PUBLIC';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- supplier_import_jobs: drop USING (true) for authenticated
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('catalogos.supplier_import_jobs') IS NOT NULL THEN
    ALTER TABLE catalogos.supplier_import_jobs ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "catalogos_admin_all_supplier_import_jobs" ON catalogos.supplier_import_jobs;
    DROP POLICY IF EXISTS catalogos_supplier_import_jobs_admin_all ON catalogos.supplier_import_jobs;
    CREATE POLICY catalogos_supplier_import_jobs_admin_all
      ON catalogos.supplier_import_jobs
      FOR ALL
      TO authenticated
      USING (public.is_active_admin())
      WITH CHECK (public.is_active_admin());
    REVOKE ALL ON TABLE catalogos.supplier_import_jobs FROM anon;
    REVOKE ALL ON TABLE catalogos.supplier_import_jobs FROM PUBLIC;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE catalogos.supplier_import_jobs TO authenticated;
    GRANT ALL ON TABLE catalogos.supplier_import_jobs TO service_role, postgres;
  END IF;
END $$;

-- Internal resume RPC must not be callable by customers
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'catalogos'
      AND p.proname = 'supplier_raw_rows_missing_normalized'
  ) THEN
    REVOKE ALL ON FUNCTION catalogos.supplier_raw_rows_missing_normalized(uuid, int) FROM PUBLIC;
    REVOKE ALL ON FUNCTION catalogos.supplier_raw_rows_missing_normalized(uuid, int) FROM anon;
    REVOKE ALL ON FUNCTION catalogos.supplier_raw_rows_missing_normalized(uuid, int) FROM authenticated;
    GRANT EXECUTE ON FUNCTION catalogos.supplier_raw_rows_missing_normalized(uuid, int) TO service_role, postgres;
  END IF;
END $$;
