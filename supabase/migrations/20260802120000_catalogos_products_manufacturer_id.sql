-- PO / margin analytics: manufacturer lives on catalog row (no public.products read).

ALTER TABLE catalogos.products
  ADD COLUMN IF NOT EXISTS manufacturer_id BIGINT REFERENCES public.manufacturers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_manufacturer_id
  ON catalogos.products (manufacturer_id)
  WHERE manufacturer_id IS NOT NULL;

COMMENT ON COLUMN catalogos.products.manufacturer_id IS 'Supplier / PO routing; mirrors legacy public.products.manufacturer_id when bridged.';
