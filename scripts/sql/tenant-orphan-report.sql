-- Phase 1 / 1A orphan & ambiguous ownership report (read-only).
-- Does NOT assign ownership. Grouped by issue type with counts + sample IDs.
-- Usage: psql "$DATABASE_URL" -f scripts/sql/tenant-orphan-report.sql

\echo '=== 1. NULL company_id on commerce tables ==='
SELECT 'ship_to_addresses' AS issue, count(*) AS n,
       (SELECT array_agg(id::text) FROM (SELECT id FROM gc_commerce.ship_to_addresses WHERE company_id IS NULL LIMIT 5) s) AS sample_ids
FROM gc_commerce.ship_to_addresses WHERE company_id IS NULL
UNION ALL
SELECT 'uploaded_invoices', count(*),
       (SELECT array_agg(id::text) FROM (SELECT id FROM gc_commerce.uploaded_invoices WHERE company_id IS NULL LIMIT 5) s)
FROM gc_commerce.uploaded_invoices WHERE company_id IS NULL
UNION ALL
SELECT 'rfqs', count(*),
       (SELECT array_agg(id::text) FROM (SELECT id FROM gc_commerce.rfqs WHERE company_id IS NULL LIMIT 5) s)
FROM gc_commerce.rfqs WHERE company_id IS NULL
UNION ALL
SELECT 'orders', count(*),
       (SELECT array_agg(id::text) FROM (SELECT id FROM gc_commerce.orders WHERE company_id IS NULL LIMIT 5) s)
FROM gc_commerce.orders WHERE company_id IS NULL
UNION ALL
SELECT 'company_quicklist_items', count(*),
       (SELECT array_agg(id::text) FROM (SELECT id FROM gc_commerce.company_quicklist_items WHERE company_id IS NULL LIMIT 5) s)
FROM gc_commerce.company_quicklist_items WHERE company_id IS NULL
UNION ALL
SELECT 'customer_manufacturer_pricing', count(*),
       (SELECT array_agg(id::text) FROM (SELECT id FROM gc_commerce.customer_manufacturer_pricing WHERE company_id IS NULL LIMIT 5) s)
FROM gc_commerce.customer_manufacturer_pricing WHERE company_id IS NULL
UNION ALL
SELECT 'net_terms_applications', count(*),
       (SELECT array_agg(id::text) FROM (SELECT id FROM gc_commerce.net_terms_applications WHERE company_id IS NULL LIMIT 5) s)
FROM gc_commerce.net_terms_applications WHERE company_id IS NULL;

\echo '=== 2. company_id referencing missing companies ==='
SELECT 'ship_to_addresses' AS issue, count(*) AS n
FROM gc_commerce.ship_to_addresses s
WHERE s.company_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM gc_commerce.companies c WHERE c.id = s.company_id)
UNION ALL
SELECT 'uploaded_invoices', count(*)
FROM gc_commerce.uploaded_invoices s
WHERE s.company_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM gc_commerce.companies c WHERE c.id = s.company_id)
UNION ALL
SELECT 'orders', count(*)
FROM gc_commerce.orders s
WHERE s.company_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM gc_commerce.companies c WHERE c.id = s.company_id)
UNION ALL
SELECT 'rfqs', count(*)
FROM gc_commerce.rfqs s
WHERE s.company_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM gc_commerce.companies c WHERE c.id = s.company_id);

\echo '=== 3. Memberships: missing company or missing auth user ==='
SELECT 'membership_missing_company' AS issue, count(*) AS n
FROM gc_commerce.company_members m
WHERE NOT EXISTS (SELECT 1 FROM gc_commerce.companies c WHERE c.id = m.company_id)
UNION ALL
SELECT 'membership_missing_auth_user', count(*)
FROM gc_commerce.company_members m
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = m.user_id);

\echo '=== 4. Users with multiple company memberships (informational) ==='
SELECT user_id::text, count(*) AS company_count,
       array_agg(company_id::text) AS company_ids
FROM gc_commerce.company_members
GROUP BY user_id
HAVING count(*) > 1
LIMIT 50;

\echo '=== 5. Quote / order child orphans ==='
SELECT 'quote_lines_without_parent' AS issue, count(*) AS n
FROM catalogos.quote_line_items li
WHERE NOT EXISTS (SELECT 1 FROM catalogos.quote_requests qr WHERE qr.id = li.quote_request_id)
UNION ALL
SELECT 'order_lines_without_parent', count(*)
FROM gc_commerce.order_lines ol
WHERE NOT EXISTS (SELECT 1 FROM gc_commerce.orders o WHERE o.id = ol.order_id);

\echo '=== 6. Quotes without gc_company_id ==='
SELECT count(*) AS quote_requests_null_gc_company,
       (SELECT array_agg(id::text) FROM (
          SELECT id FROM catalogos.quote_requests WHERE gc_company_id IS NULL LIMIT 5
        ) s) AS sample_ids
FROM catalogos.quote_requests
WHERE gc_company_id IS NULL;

\echo '=== 7. Invoices / RFQs with no company and no creator ==='
SELECT 'uploaded_invoices_no_tenant' AS issue, count(*) AS n
FROM gc_commerce.uploaded_invoices
WHERE company_id IS NULL AND created_by_user_id IS NULL
UNION ALL
SELECT 'rfqs_no_tenant', count(*)
FROM gc_commerce.rfqs
WHERE company_id IS NULL AND created_by_user_id IS NULL;

\echo '=== 8. Saved lists / quicklists ==='
SELECT 'saved_lists' AS issue, count(*) AS n
FROM gc_commerce.saved_lists sl
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = sl.user_id);

\echo '=== 9. Notifications without recipient claim ==='
SELECT count(*) AS notifications_blank_recipient
FROM catalogos.quote_notifications
WHERE recipient IS NULL OR length(trim(recipient)) = 0;

\echo '=== 10. Plaintext password_reset_tokens (post-migrate should be 0) ==='
SELECT count(*) AS plaintext_tokens
FROM public.password_reset_tokens
WHERE token IS NOT NULL AND length(token) > 0;
