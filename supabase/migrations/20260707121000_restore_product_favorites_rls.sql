-- Own-user RLS for product_favorites after user_id is UUID (auth.users / public.users).
-- Express favorites APIs use the service role (bypasses RLS).

ALTER TABLE public.product_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_favorites_select_own ON public.product_favorites;
CREATE POLICY product_favorites_select_own
  ON public.product_favorites
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS product_favorites_insert_own ON public.product_favorites;
CREATE POLICY product_favorites_insert_own
  ON public.product_favorites
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS product_favorites_delete_own ON public.product_favorites;
CREATE POLICY product_favorites_delete_own
  ON public.product_favorites
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));
