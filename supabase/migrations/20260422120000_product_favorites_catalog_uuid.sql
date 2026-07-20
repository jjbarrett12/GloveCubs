-- V2: product_favorites references catalogos.products (UUID). Legacy bigint public.products link removed.
--
-- Replay safety (2026-07-20):
-- This migration historically assumed public.product_favorites already existed (production had
-- created it before 20260302000010 was deferred). On clean-room replay the CREATE is deferred to
-- 20260630150100, so unconditional ALTER failed. Behavior now:
--   * Table missing  → create canonical intermediate shape (bigint user_id, uuid product_id → catalogos.products)
--   * Table exists with bigint product_id → convert (original production path)
--   * Table exists with uuid product_id → no-op
-- Later 20260707 converts user_id to UUID; 20260924 re-points product FK to catalog_v2.catalog_products.

DO $fav$
DECLARE
  has_table boolean;
  product_udt text;
BEGIN
  has_table := to_regclass('public.product_favorites') IS NOT NULL;

  IF NOT has_table THEN
    -- Fresh DB: create the post-UUID-product shape that this migration was meant to leave behind.
    -- public.users is bigint at this point in the timeline (UUID rewrite is 20260707120000).
    CREATE TABLE public.product_favorites (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
      product_id UUID NOT NULL REFERENCES catalogos.products (id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT product_favorites_user_id_product_id_key UNIQUE (user_id, product_id)
    );
    CREATE INDEX IF NOT EXISTS idx_product_favorites_user ON public.product_favorites (user_id);
    CREATE INDEX IF NOT EXISTS idx_product_favorites_product ON public.product_favorites (product_id);
    RETURN;
  END IF;

  SELECT c.udt_name INTO product_udt
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'product_favorites'
    AND c.column_name = 'product_id';

  IF product_udt = 'uuid' THEN
    -- Already converted (or created in UUID shape).
    CREATE INDEX IF NOT EXISTS idx_product_favorites_product ON public.product_favorites (product_id);
    RETURN;
  END IF;

  -- Existing-environment conversion: bigint product_id → catalogos.products UUID.
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
$fav$;
