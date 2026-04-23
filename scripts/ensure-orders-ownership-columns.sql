-- DEPRECATED: Legacy public.orders graph was removed (see supabase/migrations structural final cleanup).
-- B2B orders live in gc_commerce.orders (placed_by_user_id, company_id). Do not run this script.

SELECT 1 AS deprecated_script_no_op;
