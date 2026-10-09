-- Drop product_favorites policies that depend on user_id before UUID conversion.
-- Required when 20260422115000 previously created auth.uid() policies on bigint user_id.
DROP POLICY IF EXISTS product_favorites_select_own ON public.product_favorites;
DROP POLICY IF EXISTS product_favorites_insert_own ON public.product_favorites;
DROP POLICY IF EXISTS product_favorites_delete_own ON public.product_favorites;
