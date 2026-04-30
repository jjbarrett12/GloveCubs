-- Variant size axis + purchase item number (mirrors variant_sku per product spec).

ALTER TABLE catalog_v2.catalog_variants
  ADD COLUMN IF NOT EXISTS size_code TEXT;

COMMENT ON COLUMN catalog_v2.catalog_variants.size_code IS
  'Normalized size for this sellable variant (e.g. s, m, xl). Parent catalog_products must not store size in product_attributes.';

-- purchase_item_number is always identical to variant_sku (authoritative PO / cart line identity).
ALTER TABLE catalog_v2.catalog_variants
  ADD COLUMN IF NOT EXISTS purchase_item_number TEXT GENERATED ALWAYS AS (variant_sku) STORED;

COMMENT ON COLUMN catalog_v2.catalog_variants.purchase_item_number IS
  'Generated: always equals variant_sku.';

CREATE INDEX IF NOT EXISTS idx_catalog_variants_product_size_code
  ON catalog_v2.catalog_variants (catalog_product_id, size_code)
  WHERE is_active = true AND size_code IS NOT NULL;

UPDATE catalog_v2.catalog_variants cv
SET size_code = NULLIF(btrim(cv.metadata ->> 'size'), '')
WHERE (cv.size_code IS NULL OR btrim(cv.size_code) = '')
  AND cv.metadata ? 'size'
  AND NULLIF(btrim(cv.metadata ->> 'size'), '') IS NOT NULL;
