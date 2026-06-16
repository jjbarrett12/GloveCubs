-- =============================================================================
-- GloveCubs contamination report (READ-ONLY)
-- Safe to run on production/staging — SELECT only. No DELETE/UPDATE/TRUNCATE.
--
-- Run in Supabase SQL Editor or psql. Pair with:
--   node scripts/contamination-report.mjs
--   lib/contamination-heuristics.js
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) public.users — demo + load-test + e2e emails
-- -----------------------------------------------------------------------------
SELECT 'public.users' AS section, COUNT(*) AS flagged_count
FROM public.users u
WHERE LOWER(u.email) = 'demo@company.com'
   OR u.email ILIKE '%@glovecubs-test.com'
   OR u.email ILIKE '%@example.com'
   OR u.email ILIKE '%@test.local'
   OR u.email ILIKE 'loadtest%'
   OR u.email ILIKE 'test-e2e-%'
   OR u.email ILIKE 'test-%';

SELECT id, email, company_name, contact_name, created_at
FROM public.users
WHERE LOWER(email) = 'demo@company.com'
   OR email ILIKE '%@glovecubs-test.com'
   OR email ILIKE '%@example.com'
   OR email ILIKE 'loadtest%'
   OR email ILIKE 'test-e2e-%'
   OR email ILIKE 'test-%'
ORDER BY created_at DESC
LIMIT 50;

-- -----------------------------------------------------------------------------
-- 2) public.admin_users / app_admins — test operator emails
-- -----------------------------------------------------------------------------
SELECT 'public.admin_users' AS section, COUNT(*) AS flagged_count
FROM public.admin_users
WHERE email ILIKE '%@glovecubs-test.com'
   OR email ILIKE '%@example.com'
   OR email ILIKE 'loadtest%'
   OR LOWER(email) = 'demo@company.com';

SELECT id, email, is_active, created_at
FROM public.admin_users
WHERE email ILIKE '%@glovecubs-test.com'
   OR email ILIKE '%@example.com'
   OR email ILIKE 'loadtest%'
   OR LOWER(email) = 'demo@company.com'
ORDER BY created_at DESC
LIMIT 25;

-- -----------------------------------------------------------------------------
-- 3) gc_commerce.companies — known demo / load-test names
-- -----------------------------------------------------------------------------
SELECT 'gc_commerce.companies' AS section, COUNT(*) AS flagged_count
FROM gc_commerce.companies c
WHERE LOWER(c.trade_name) IN ('demo company inc', 'loadtest company', 'test company llc')
   OR LOWER(c.trade_name) LIKE 'loadtest company%'
   OR LOWER(c.legal_name) IN ('demo company inc', 'loadtest company', 'test company llc');

SELECT id, trade_name, legal_name, slug, created_at
FROM gc_commerce.companies
WHERE LOWER(trade_name) IN ('demo company inc', 'loadtest company', 'test company llc')
   OR LOWER(trade_name) LIKE 'loadtest company%'
ORDER BY created_at DESC
LIMIT 25;

-- -----------------------------------------------------------------------------
-- 4) catalog_v2 demo catalog products
-- -----------------------------------------------------------------------------
SELECT 'catalog_v2.catalog_products' AS section, COUNT(*) AS flagged_count
FROM catalog_v2.catalog_products p
WHERE p.slug LIKE 'demo-product-%';

SELECT p.id, p.slug, p.name, p.status, t.code AS product_type_code
FROM catalog_v2.catalog_products p
LEFT JOIN catalog_v2.catalog_product_types t ON t.id = p.product_type_id
WHERE p.slug LIKE 'demo-product-%'
   OR t.code = 'gc_demo_gloves'
ORDER BY p.created_at DESC
LIMIT 25;

-- -----------------------------------------------------------------------------
-- 5) legacy public.products — placeholder images + seed SKU families
-- -----------------------------------------------------------------------------
SELECT 'public.products' AS section, COUNT(*) AS flagged_count
FROM public.products p
WHERE p.image_url ILIKE '%via.placeholder.com%'
   OR p.image_url ILIKE '%placehold.co%'
   OR p.sku LIKE 'GLV-%';

SELECT id, sku, slug, name, image_url, created_at
FROM public.products
WHERE image_url ILIKE '%via.placeholder.com%'
   OR image_url ILIKE '%placehold.co%'
   OR sku LIKE 'GLV-%'
ORDER BY created_at DESC
LIMIT 25;

-- -----------------------------------------------------------------------------
-- 6) catalogos.quote_requests — load-test RFQs
-- -----------------------------------------------------------------------------
SELECT 'catalogos.quote_requests' AS section, COUNT(*) AS flagged_count
FROM catalogos.quote_requests q
WHERE LOWER(q.email) = 'demo@company.com'
   OR q.email ILIKE '%@glovecubs-test.com'
   OR q.email ILIKE '%@example.com'
   OR q.email ILIKE 'loadtest%'
   OR LOWER(q.company_name) LIKE 'loadtest company%'
   OR LOWER(q.company_name) = 'demo company inc';

SELECT id, email, company_name, contact_name, created_at
FROM catalogos.quote_requests
WHERE LOWER(email) = 'demo@company.com'
   OR email ILIKE '%@glovecubs-test.com'
   OR email ILIKE 'loadtest%'
   OR LOWER(company_name) LIKE 'loadtest company%'
ORDER BY created_at DESC
LIMIT 50;

-- -----------------------------------------------------------------------------
-- 7) gc_commerce.rfqs — payload email/company patterns
-- -----------------------------------------------------------------------------
SELECT 'gc_commerce.rfqs' AS section, COUNT(*) AS flagged_count
FROM gc_commerce.rfqs r
WHERE (r.payload->>'email') ILIKE '%@glovecubs-test.com'
   OR (r.payload->>'email') ILIKE 'loadtest%'
   OR (r.payload->>'email') ILIKE 'test-%'
   OR LOWER(r.payload->>'company_name') LIKE 'loadtest company%'
   OR (r.payload->>'notes') ILIKE '%load test%';

SELECT id, payload->>'email' AS email, payload->>'company_name' AS company_name, created_at
FROM gc_commerce.rfqs
WHERE (payload->>'email') ILIKE '%@glovecubs-test.com'
   OR (payload->>'email') ILIKE 'loadtest%'
   OR LOWER(payload->>'company_name') LIKE 'loadtest company%'
ORDER BY created_at DESC
LIMIT 50;

-- -----------------------------------------------------------------------------
-- 8) gc_commerce.orders — order_number + company slug/name (no notes column required)
-- -----------------------------------------------------------------------------
SELECT 'gc_commerce.orders' AS section, COUNT(*) AS flagged_count
FROM gc_commerce.orders o
LEFT JOIN gc_commerce.companies c ON c.id = o.company_id
WHERE UPPER(COALESCE(o.order_number, '')) LIKE 'MATRIX-%'
   OR UPPER(COALESCE(o.order_number, '')) LIKE 'LEGACY-%'
   OR UPPER(COALESCE(o.order_number, '')) LIKE 'LEGACY-MATRIX%'
   OR UPPER(COALESCE(o.order_number, '')) LIKE 'CONC-%'
   OR UPPER(COALESCE(o.order_number, '')) LIKE 'INV-%'
   OR UPPER(COALESCE(o.order_number, '')) LIKE 'REL-%'
   OR UPPER(COALESCE(o.order_number, '')) LIKE 'R6ADD-%'
   OR UPPER(COALESCE(o.order_number, '')) LIKE 'LEG-%'
   OR LOWER(COALESCE(c.slug, '')) = 'legacy-no-company-backfill'
   OR LOWER(COALESCE(c.trade_name, '')) = 'legacy orders (no company)'
   OR LOWER(COALESCE(o.metadata::text, '')) LIKE '%load test%'
   OR LOWER(COALESCE(o.metadata::text, '')) LIKE '%commerce truth smoke%';

SELECT o.id, o.order_number, c.trade_name AS company_name, c.slug AS company_slug,
       o.stripe_payment_intent_id IS NOT NULL AS has_stripe, o.created_at
FROM gc_commerce.orders o
LEFT JOIN gc_commerce.companies c ON c.id = o.company_id
WHERE UPPER(COALESCE(o.order_number, '')) LIKE 'MATRIX-%'
   OR UPPER(COALESCE(o.order_number, '')) LIKE 'LEGACY-%'
   OR LOWER(COALESCE(c.slug, '')) = 'legacy-no-company-backfill'
ORDER BY o.created_at DESC
LIMIT 25;

-- -----------------------------------------------------------------------------
-- 9) public.stock_history — smoke / test adjustment notes
-- -----------------------------------------------------------------------------
SELECT 'public.stock_history' AS section, COUNT(*) AS flagged_count
FROM public.stock_history h
WHERE LOWER(COALESCE(h.notes, '')) LIKE '%load test%'
   OR LOWER(COALESCE(h.notes, '')) LIKE '%commerce truth smoke%'
   OR LOWER(COALESCE(h.notes, '')) LIKE '%e2e%';

SELECT id, notes, delta, type, created_at
FROM public.stock_history
WHERE LOWER(COALESCE(notes, '')) LIKE '%load test%'
   OR LOWER(COALESCE(notes, '')) LIKE '%e2e%'
ORDER BY created_at DESC
LIMIT 25;

-- -----------------------------------------------------------------------------
-- 10) catalogos.suppliers — migration sample supplier
-- -----------------------------------------------------------------------------
SELECT 'catalogos.suppliers' AS section, COUNT(*) AS flagged_count
FROM catalogos.suppliers s
WHERE s.slug = 'sample-supplier'
   OR LOWER(s.name) = 'sample supplier';

SELECT id, slug, name, is_active, created_at
FROM catalogos.suppliers
WHERE slug = 'sample-supplier'
   OR LOWER(name) = 'sample supplier';

-- -----------------------------------------------------------------------------
-- 11) public.contact_messages — test inbox entries (payload JSON)
-- -----------------------------------------------------------------------------
SELECT 'public.contact_messages' AS section, COUNT(*) AS flagged_count
FROM public.contact_messages m
WHERE (m.payload->>'email') ILIKE '%@glovecubs-test.com'
   OR (m.payload->>'email') ILIKE 'loadtest%'
   OR (m.payload->>'email') ILIKE '%@example.com'
   OR LOWER(m.payload->>'company') LIKE 'loadtest company%';

SELECT id, payload->>'email' AS email, payload->>'company' AS company, payload->>'name' AS name, created_at
FROM public.contact_messages
WHERE (payload->>'email') ILIKE '%@glovecubs-test.com'
   OR (payload->>'email') ILIKE 'loadtest%'
ORDER BY created_at DESC
LIMIT 25;

-- -----------------------------------------------------------------------------
-- 12) catalogos.recommendation_outcomes — load-test duplicate IDs
-- -----------------------------------------------------------------------------
SELECT 'catalogos.recommendation_outcomes' AS section, COUNT(*) AS flagged_count
FROM catalogos.recommendation_outcomes ro
WHERE ro.recommendation_id ILIKE 'rec-duplicate-test-%';

SELECT id, recommendation_id, outcome, created_at
FROM catalogos.recommendation_outcomes
WHERE recommendation_id ILIKE 'rec-duplicate-test-%'
ORDER BY created_at DESC
LIMIT 25;

-- -----------------------------------------------------------------------------
-- 13) public.purchase_orders — notes mentioning load/e2e (manual review)
-- -----------------------------------------------------------------------------
SELECT 'public.purchase_orders' AS section, COUNT(*) AS flagged_count
FROM public.purchase_orders po
WHERE LOWER(COALESCE(po.notes, '')) LIKE '%load test%'
   OR LOWER(COALESCE(po.notes, '')) LIKE '%e2e%';

SELECT id, po_number, notes, created_at
FROM public.purchase_orders
WHERE LOWER(COALESCE(notes, '')) LIKE '%load test%'
ORDER BY created_at DESC
LIMIT 25;
