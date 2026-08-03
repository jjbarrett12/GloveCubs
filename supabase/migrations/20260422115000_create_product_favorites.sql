-- =============================================================================
-- Blank-project prerequisite: create public.product_favorites before
-- 20260422120000 alters product_id to catalogos.products UUID.
--
-- History: 20260302000010 was reduced to a placeholder because it sorted before
-- public.users (20260330000001). Creation was deferred to 20260630150100, which
-- sorts AFTER 20260422120000 — breaking empty-project pushes.
--
-- Shape matches 20260630150100 so CREATE TABLE IF NOT EXISTS there remains a
-- no-op when this migration already ran. 20260422120000 then converts product_id
-- to uuid; 20260707120000 converts user_id to uuid when still bigint.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.product_favorites (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_product_favorites_user ON public.product_favorites (user_id);
CREATE INDEX IF NOT EXISTS idx_product_favorites_product ON public.product_favorites (product_id);

ALTER TABLE public.product_favorites ENABLE ROW LEVEL SECURITY;

-- Deny-by-default for customers. Express favorites APIs use the service role
-- (bypasses RLS). After user_id becomes UUID (20260707120000), auth.uid() matches.
DROP POLICY IF EXISTS product_favorites_select_own ON public.product_favorites;
CREATE POLICY product_favorites_select_own
  ON public.product_favorites
  FOR SELECT
  TO authenticated
  USING (user_id::text = (SELECT auth.uid()::text));

DROP POLICY IF EXISTS product_favorites_insert_own ON public.product_favorites;
CREATE POLICY product_favorites_insert_own
  ON public.product_favorites
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id::text = (SELECT auth.uid()::text));

DROP POLICY IF EXISTS product_favorites_delete_own ON public.product_favorites;
CREATE POLICY product_favorites_delete_own
  ON public.product_favorites
  FOR DELETE
  TO authenticated
  USING (user_id::text = (SELECT auth.uid()::text));

-- No UPDATE policy (favorites are insert/delete only).
-- No USING (true) / WITH CHECK (true) for authenticated.
