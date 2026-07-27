-- Phase 1 Security Advisor–style audit (local / operator SQL).
-- Does NOT replace Supabase Dashboard → Security Advisor.
-- If advisor access is unavailable, label results UNVERIFIED in the Phase 1 report.
--
-- Usage: run in Supabase SQL editor or: psql "$DATABASE_URL" -f scripts/sql/security-advisor-audit.sql

\echo '=== Tables in commerce schemas without RLS ==='

SELECT n.nspname AS schema, c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname IN ('gc_commerce', 'catalogos', 'catalog_v2', 'public')
  AND c.relrowsecurity IS NOT TRUE
  AND c.relname NOT LIKE 'pg_%'
ORDER BY 1, 2;

\echo '=== Policies with USING (true) or WITH CHECK (true) ==='

SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname IN ('gc_commerce', 'catalogos', 'catalog_v2', 'public', 'storage')
  AND (
    qual IS NULL
    OR qual = 'true'
    OR with_check = 'true'
  )
ORDER BY 1, 2, 3;

\echo '=== Grants to anon on sensitive schemas ==='

SELECT table_schema, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'anon'
  AND table_schema IN ('gc_commerce', 'catalogos', 'catalog_v2', 'public')
  AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
ORDER BY 1, 2, 3;

\echo '=== SECURITY DEFINER functions without pinned search_path ==='

SELECT n.nspname, p.proname, p.prosecdef,
       pg_get_function_identity_arguments(p.oid) AS args,
       p.proconfig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prosecdef IS TRUE
  AND n.nspname IN ('gc_commerce', 'catalogos', 'catalog_v2', 'public')
  AND (
    p.proconfig IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%'
    )
  )
ORDER BY 1, 2;

\echo '=== supplier_offers policies (expect admin-only / no anon) ==='

SELECT schemaname, tablename, policyname, roles, cmd, qual
FROM pg_policies
WHERE tablename IN ('supplier_offers', 'offer_trust_scores', 'suppliers')
ORDER BY 1, 2, 3;
