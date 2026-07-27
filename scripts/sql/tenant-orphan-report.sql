-- Phase 1 orphan / ambiguous ownership report (read-only).
-- Run before applying RLS migrations against a copy of production.
-- Do NOT invent company_id for NULL/orphan rows — leave inaccessible to customers.
--
-- Usage (psql / Supabase SQL editor):
--   \i scripts/sql/tenant-orphan-report.sql

\echo '=== gc_commerce rows with NULL company_id ==='

SELECT 'ship_to_addresses' AS tbl, count(*) AS null_company
FROM gc_commerce.ship_to_addresses WHERE company_id IS NULL
UNION ALL
SELECT 'uploaded_invoices', count(*) FROM gc_commerce.uploaded_invoices WHERE company_id IS NULL
UNION ALL
SELECT 'rfqs', count(*) FROM gc_commerce.rfqs WHERE company_id IS NULL
UNION ALL
SELECT 'orders', count(*) FROM gc_commerce.orders WHERE company_id IS NULL
UNION ALL
SELECT 'company_quicklist_items', count(*) FROM gc_commerce.company_quicklist_items WHERE company_id IS NULL
UNION ALL
SELECT 'customer_manufacturer_pricing', count(*) FROM gc_commerce.customer_manufacturer_pricing WHERE company_id IS NULL
UNION ALL
SELECT 'net_terms_applications', count(*) FROM gc_commerce.net_terms_applications WHERE company_id IS NULL;

\echo '=== company_id referencing missing companies ==='

SELECT 'ship_to_addresses' AS tbl, count(*) AS orphan_fk
FROM gc_commerce.ship_to_addresses s
WHERE s.company_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM gc_commerce.companies c WHERE c.id = s.company_id)
UNION ALL
SELECT 'uploaded_invoices', count(*)
FROM gc_commerce.uploaded_invoices s
WHERE s.company_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM gc_commerce.companies c WHERE c.id = s.company_id)
UNION ALL
SELECT 'orders', count(*)
FROM gc_commerce.orders s
WHERE s.company_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM gc_commerce.companies c WHERE c.id = s.company_id);

\echo '=== quote_requests without gc_company_id ==='

SELECT count(*) AS quote_requests_null_gc_company
FROM catalogos.quote_requests
WHERE gc_company_id IS NULL;

\echo '=== members pointing at missing companies ==='

SELECT count(*) AS orphan_memberships
FROM gc_commerce.company_members m
WHERE NOT EXISTS (SELECT 1 FROM gc_commerce.companies c WHERE c.id = m.company_id);

\echo '=== plaintext password_reset_tokens still present (post-migration should be 0) ==='

SELECT count(*) AS plaintext_tokens
FROM public.password_reset_tokens
WHERE token IS NOT NULL AND length(token) > 0;
