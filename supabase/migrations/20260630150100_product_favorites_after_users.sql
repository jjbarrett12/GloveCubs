-- =============================================================================
-- product_favorites: must run after public.users exists (20260330000001).
-- 20260302000010 ran lexicographically before users and would fail on REFERENCES.
--
-- Replay safety (2026-07-20):
-- On fresh DBs, 20260422120000 now creates the UUID-product shape when the table is
-- missing. This migration converges:
--   * CREATE IF NOT EXISTS with UUID product_id → catalogos.products (not legacy bigint)
--   * If an older bigint product_id table somehow still exists, convert it
-- Do not create a second competing favorites table.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.product_favorites (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES catalogos.products (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT product_favorites_user_id_product_id_key UNIQUE (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_product_favorites_user ON public.product_favorites (user_id);
CREATE INDEX IF NOT EXISTS idx_product_favorites_product ON public.product_favorites (product_id);

-- Converge leftover legacy bigint product_id (should be rare after 20260422120000).
DO $fav_conv$
DECLARE
  product_udt text;
BEGIN
  IF to_regclass('public.product_favorites') IS NULL THEN
    RETURN;
  END IF;

  SELECT c.udt_name INTO product_udt
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'product_favorites'
    AND c.column_name = 'product_id';

  IF product_udt IS NULL OR product_udt = 'uuid' THEN
    RETURN;
  END IF;

  TRUNCATE TABLE public.product_favorites;

  ALTER TABLE public.product_favorites DROP CONSTRAINT IF EXISTS product_favorites_product_id_fkey;
  ALTER TABLE public.product_favorites DROP CONSTRAINT IF EXISTS product_favorites_user_id_product_id_key;
  ALTER TABLE public.product_favorites DROP COLUMN product_id;
  ALTER TABLE public.product_favorites
    ADD COLUMN product_id uuid NOT NULL REFERENCES catalogos.products (id) ON DELETE CASCADE;
  ALTER TABLE public.product_favorites
    ADD CONSTRAINT product_favorites_user_id_product_id_key UNIQUE (user_id, product_id);
  CREATE INDEX IF NOT EXISTS idx_product_favorites_product ON public.product_favorites (product_id);
END
$fav_conv$;
