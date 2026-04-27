-- B2B baseline and internal cost on sellable row (canonical commerce pricing, cents).
ALTER TABLE gc_commerce.sellable_products
  ADD COLUMN IF NOT EXISTS bulk_price_minor BIGINT;

ALTER TABLE gc_commerce.sellable_products
  ADD COLUMN IF NOT EXISTS unit_cost_minor BIGINT;

ALTER TABLE gc_commerce.sellable_products
  DROP CONSTRAINT IF EXISTS ck_gc_sellable_products_bulk_price_minor_nonneg;

ALTER TABLE gc_commerce.sellable_products
  ADD CONSTRAINT ck_gc_sellable_products_bulk_price_minor_nonneg CHECK (
    bulk_price_minor IS NULL OR bulk_price_minor >= 0
  );

ALTER TABLE gc_commerce.sellable_products
  DROP CONSTRAINT IF EXISTS ck_gc_sellable_products_unit_cost_minor_nonneg;

ALTER TABLE gc_commerce.sellable_products
  ADD CONSTRAINT ck_gc_sellable_products_unit_cost_minor_nonneg CHECK (
    unit_cost_minor IS NULL OR unit_cost_minor >= 0
  );

COMMENT ON COLUMN gc_commerce.sellable_products.bulk_price_minor IS
  'B2B baseline unit price (minor units); guest checkout uses list_price_minor only.';
COMMENT ON COLUMN gc_commerce.sellable_products.unit_cost_minor IS
  'Internal unit cost (minor units); not a public list price.';
