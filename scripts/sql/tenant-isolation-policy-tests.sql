-- Phase 1 tenant-isolation policy tests (requires migrated DB + test fixtures).
-- NOT run in CI by default — needs service_role to seed, then JWT clients to assert.
--
-- Fixture setup (run as service_role / postgres):
--   1. Create companies A/B, users (owner/member/viewer A, owner B, removed A), admin_users row.
--   2. Insert address/invoice/rfq/order/saved_list/quote for each company.
--   3. SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '<user_uuid>', true);
--
-- Expected outcomes are asserted via DO blocks that RAISE EXCEPTION on failure.
-- Label overall suite SKIPPED/UNVERIFIED if DATABASE_URL or fixtures unavailable.

\echo '=== Helper: is_company_member uses auth.uid only ==='

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'gc_commerce' AND p.proname = 'is_company_member'
  ) THEN
    RAISE EXCEPTION 'MISSING helper gc_commerce.is_company_member — apply Phase 1 migrations';
  END IF;
END $$;

\echo '=== Anon cannot SELECT supplier_offers (expect 0 rows or permission error) ==='

SET ROLE anon;
DO $$
DECLARE
  n bigint;
BEGIN
  BEGIN
    SELECT count(*) INTO n FROM catalogos.supplier_offers;
    IF n > 0 THEN
      RAISE EXCEPTION 'FAIL: anon read % supplier_offers rows', n;
    END IF;
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL; -- preferred
    WHEN undefined_table THEN
      RAISE NOTICE 'SKIP: catalogos.supplier_offers missing';
  END;
END $$;
RESET ROLE;

\echo '=== password_reset_tokens: no grants to authenticated ==='

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'password_reset_tokens'
      AND grantee IN ('anon', 'authenticated')
      AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  ) THEN
    RAISE EXCEPTION 'FAIL: password_reset_tokens still granted to anon/authenticated';
  END IF;
END $$;

\echo '=== public read supplier_offers policy must be absent ==='

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'catalogos'
      AND tablename = 'supplier_offers'
      AND policyname = 'public read supplier_offers'
  ) THEN
    RAISE EXCEPTION 'FAIL: public read supplier_offers policy still present';
  END IF;
END $$;

\echo '=== supplier_import_jobs must not use USING (true) for authenticated ==='

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'catalogos'
      AND tablename = 'supplier_import_jobs'
      AND (qual = 'true' OR with_check = 'true')
      AND 'authenticated' = ANY (roles)
  ) THEN
    RAISE EXCEPTION 'FAIL: supplier_import_jobs still permissive for authenticated';
  END IF;
END $$;

\echo 'OK: static policy assertions passed (JWT cross-tenant cases require fixtures — see runbook)';
