-- Post-cutover checks (run in SQL editor or psql against your Supabase DB).
-- Adjust expectations if you intentionally retain empty legacy tables.

-- 1) Admin identity: authority is Auth UUID only
SELECT COUNT(*) AS bad_app_admin_rows
FROM public.app_admins
WHERE auth_user_id IS NULL;

-- 2) Canonical commerce: orders are UUID-keyed with UUID companies
SELECT COUNT(*) AS orders_missing_company
FROM gc_commerce.orders
WHERE company_id IS NULL;

-- 3) No rows in legacy public.orders if you applied a drop migration (otherwise expect 0 usage from app)
-- SELECT COUNT(*) FROM public.orders;

-- 4) Duplicate membership path removed (public.company_members should not exist after cutover migration)
-- SELECT to_regclass('public.company_members');  -- expect NULL

-- 5) Net terms applications live in gc_commerce
SELECT COUNT(*) AS pending_nta_gc
FROM gc_commerce.net_terms_applications
WHERE status = 'pending';

-- 6) Sample: invoice AR payments attach to gc orders (UUID)
SELECT COUNT(*) AS gc_ar_payments_bad_order
FROM gc_commerce.ar_invoice_payments p
WHERE NOT EXISTS (SELECT 1 FROM gc_commerce.orders o WHERE o.id = p.order_id);
