-- =============================================================================
-- GloveCubs contamination quarantine review (READ-ONLY)
-- FK / reference checks before operator-approved cleanup.
-- Pair with: node scripts/contamination-quarantine-plan.mjs
-- NO DELETE / UPDATE / TRUNCATE
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Flagged company: downstream orders and members
-- Replace :company_id with candidate id from quarantine-plan.json
-- -----------------------------------------------------------------------------
-- SELECT 'company_orders' AS check_type, COUNT(*) AS ref_count
-- FROM gc_commerce.orders WHERE company_id = :company_id;

-- SELECT 'company_members' AS check_type, COUNT(*) AS ref_count
-- FROM gc_commerce.company_members WHERE company_id = :company_id;

SELECT c.id, c.trade_name, c.slug,
       (SELECT COUNT(*) FROM gc_commerce.orders o WHERE o.company_id = c.id) AS order_count,
       (SELECT COUNT(*) FROM gc_commerce.company_members m WHERE m.company_id = c.id) AS member_count
FROM gc_commerce.companies c
WHERE LOWER(c.slug) = 'legacy-no-company-backfill'
   OR LOWER(c.trade_name) = 'legacy orders (no company)';

-- -----------------------------------------------------------------------------
-- 2) Flagged catalog product: variants and images
-- -----------------------------------------------------------------------------
SELECT p.id, p.slug, p.name, p.status,
       (SELECT COUNT(*) FROM catalog_v2.catalog_variants v WHERE v.product_id = p.id) AS variant_count,
       (SELECT COUNT(*) FROM catalog_v2.catalog_product_images i WHERE i.product_id = p.id) AS image_count
FROM catalog_v2.catalog_products p
WHERE p.slug IN ('test-product', 'demo-product-1')
   OR p.slug LIKE 'demo-product-%';

-- -----------------------------------------------------------------------------
-- 3) Flagged supplier: catalog references (manual review)
-- -----------------------------------------------------------------------------
SELECT s.id, s.slug, s.name,
       (SELECT COUNT(*) FROM catalogos.supplier_products sp WHERE sp.supplier_id = s.id) AS supplier_product_count
FROM catalogos.suppliers s
WHERE s.slug IN ('sample-supplier', 'glovecubs-legacy-catalog');

-- -----------------------------------------------------------------------------
-- 4) Flagged orders: payment / invoice signals (never auto-delete)
-- -----------------------------------------------------------------------------
SELECT o.id, o.order_number, c.trade_name AS company_name,
       o.stripe_payment_intent_id IS NOT NULL AS has_stripe,
       o.payment_confirmed_at IS NOT NULL AS payment_confirmed,
       o.invoice_status,
       o.invoice_amount_paid,
       o.total_minor,
       (SELECT COUNT(*) FROM gc_commerce.order_lines ol WHERE ol.order_id = o.id) AS line_count
FROM gc_commerce.orders o
LEFT JOIN gc_commerce.companies c ON c.id = o.company_id
WHERE UPPER(COALESCE(o.order_number, '')) LIKE 'MATRIX-%'
   OR UPPER(COALESCE(o.order_number, '')) LIKE 'LEGACY-%'
   OR LOWER(COALESCE(c.slug, '')) = 'legacy-no-company-backfill'
ORDER BY o.created_at DESC
LIMIT 50;

-- -----------------------------------------------------------------------------
-- 5) Flagged quote requests: linked opportunities
-- -----------------------------------------------------------------------------
SELECT q.id, q.email, q.company_name, q.status,
       (SELECT COUNT(*) FROM public.procurement_opportunities po WHERE po.quote_request_id = q.id) AS opportunity_count
FROM catalogos.quote_requests q
WHERE q.email ILIKE '%@test.local'
   OR q.email ILIKE '%@glovecubs-test.com'
   OR q.email ILIKE 'loadtest%';

-- -----------------------------------------------------------------------------
-- 6) Flagged users / admins — identity records (never auto-delete without auth review)
-- -----------------------------------------------------------------------------
SELECT u.id, u.email, u.company_name,
       (SELECT COUNT(*) FROM gc_commerce.company_members m WHERE m.user_id = u.id) AS membership_count
FROM public.users u
WHERE LOWER(u.email) = 'demo@company.com'
   OR u.email ILIKE '%@test.local'
   OR u.email ILIKE '%@glovecubs-test.com';

SELECT au.id, au.is_active, u.email
FROM public.admin_users au
LEFT JOIN public.users u ON u.id = au.id
WHERE u.email ILIKE '%@test.local'
   OR u.email ILIKE '%@glovecubs-test.com';

-- -----------------------------------------------------------------------------
-- 7) Summary counts for operator checklist
-- -----------------------------------------------------------------------------
SELECT 'flagged_orders_matrix_legacy' AS metric,
       COUNT(*) AS cnt
FROM gc_commerce.orders o
LEFT JOIN gc_commerce.companies c ON c.id = o.company_id
WHERE UPPER(COALESCE(o.order_number, '')) LIKE 'MATRIX-%'
   OR UPPER(COALESCE(o.order_number, '')) LIKE 'LEGACY-%'
   OR LOWER(COALESCE(c.slug, '')) = 'legacy-no-company-backfill';

SELECT 'flagged_test_catalog_products' AS metric,
       COUNT(*) AS cnt
FROM catalog_v2.catalog_products
WHERE slug = 'test-product' OR slug LIKE 'demo-product-%';

SELECT 'flagged_sample_suppliers' AS metric,
       COUNT(*) AS cnt
FROM catalogos.suppliers
WHERE slug = 'sample-supplier';
