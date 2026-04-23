-- V2: product_favorites references catalogos.products (UUID). Legacy bigint public.products link removed.

TRUNCATE TABLE public.product_favorites;

ALTER TABLE public.product_favorites DROP CONSTRAINT IF EXISTS product_favorites_product_id_fkey;
ALTER TABLE public.product_favorites DROP CONSTRAINT IF EXISTS product_favorites_user_id_product_id_key;

ALTER TABLE public.product_favorites DROP COLUMN product_id;

ALTER TABLE public.product_favorites
  ADD COLUMN product_id uuid NOT NULL REFERENCES catalogos.products (id) ON DELETE CASCADE;

ALTER TABLE public.product_favorites
  ADD CONSTRAINT product_favorites_user_id_product_id_key UNIQUE (user_id, product_id);

CREATE INDEX IF NOT EXISTS idx_product_favorites_product ON public.product_favorites (product_id);
