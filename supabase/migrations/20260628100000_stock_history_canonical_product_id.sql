-- Additive: align stock_history audit rows with catalog UUID where known (optional FK to catalogos.products).

ALTER TABLE public.stock_history
  ADD COLUMN IF NOT EXISTS canonical_product_id UUID;

COMMENT ON COLUMN public.stock_history.canonical_product_id IS
  'catalogos.products.id when known; populated on new writes and backfilled from public.inventory where possible. Legacy product_id retained.';

CREATE INDEX IF NOT EXISTS idx_stock_history_canonical_product_id
  ON public.stock_history (canonical_product_id)
  WHERE canonical_product_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_stock_history_canonical_catalog_product'
  ) THEN
    ALTER TABLE public.stock_history
      ADD CONSTRAINT fk_stock_history_canonical_catalog_product
      FOREIGN KEY (canonical_product_id)
      REFERENCES catalogos.products (id)
      ON DELETE SET NULL
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

-- Best-effort backfill from inventory rows that already have UUID
UPDATE public.stock_history sh
SET canonical_product_id = i.canonical_product_id
FROM public.inventory i
WHERE i.product_id = sh.product_id
  AND sh.canonical_product_id IS NULL
  AND i.canonical_product_id IS NOT NULL;
