-- =============================================================================
-- Forward convergence: product_favorites canonical shape (pre-invitation)
-- =============================================================================
-- Historical favorites migrations were amended for clean-room replay. Deployed DBs
-- that already recorded those versions will not re-run them. This migration asserts
-- the end-of-baseline shape after catalog_v2 cutover and UUID users.
--
-- Final product identity: catalog_v2.catalog_products (id UUID)
-- Final user identity: public.users (id UUID)
-- No destructive customer data changes; fails loudly on incompatible drift.
-- =============================================================================

DO $assert_fav$
DECLARE
  product_udt text;
  user_udt text;
  fk_target text;
BEGIN
  IF to_regclass('public.product_favorites') IS NULL THEN
    RAISE EXCEPTION 'product_favorites missing at convergence; expected table public.product_favorites';
  END IF;

  SELECT c.udt_name INTO product_udt
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'product_favorites' AND c.column_name = 'product_id';

  SELECT c.udt_name INTO user_udt
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'product_favorites' AND c.column_name = 'user_id';

  IF product_udt IS DISTINCT FROM 'uuid' THEN
    RAISE EXCEPTION 'product_favorites.product_id must be uuid, found %', product_udt;
  END IF;

  IF user_udt IS DISTINCT FROM 'uuid' THEN
    RAISE EXCEPTION 'product_favorites.user_id must be uuid, found %', user_udt;
  END IF;

  SELECT c.confrelid::regclass::text INTO fk_target
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
  WHERE c.conrelid = 'public.product_favorites'::regclass
    AND c.contype = 'f'
    AND a.attname = 'product_id'
  LIMIT 1;

  IF fk_target IS NULL THEN
    -- Attach canonical FK if missing (idempotent).
    IF to_regclass('catalog_v2.catalog_products') IS NOT NULL THEN
      ALTER TABLE public.product_favorites DROP CONSTRAINT IF EXISTS product_favorites_product_id_fkey;
      ALTER TABLE public.product_favorites
        ADD CONSTRAINT product_favorites_product_id_fkey
        FOREIGN KEY (product_id) REFERENCES catalog_v2.catalog_products (id) ON DELETE CASCADE;
    ELSIF to_regclass('catalogos.products') IS NOT NULL THEN
      ALTER TABLE public.product_favorites DROP CONSTRAINT IF EXISTS product_favorites_product_id_fkey;
      ALTER TABLE public.product_favorites
        ADD CONSTRAINT product_favorites_product_id_fkey
        FOREIGN KEY (product_id) REFERENCES catalogos.products (id) ON DELETE CASCADE;
    ELSE
      RAISE EXCEPTION 'product_favorites.product_id has no FK and no catalog product table exists';
    END IF;
  ELSIF fk_target NOT IN ('catalog_v2.catalog_products', 'catalogos.products') THEN
    RAISE EXCEPTION 'product_favorites.product_id FK targets %, expected catalog_v2.catalog_products or catalogos.products', fk_target;
  END IF;

  CREATE INDEX IF NOT EXISTS idx_product_favorites_user ON public.product_favorites (user_id);
  CREATE INDEX IF NOT EXISTS idx_product_favorites_product ON public.product_favorites (product_id);
END
$assert_fav$;
