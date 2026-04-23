-- =============================================================================
-- 1) product_attributes: allow one row per (product_id, attribute_definition_id, value_text)
--    for multi-select attributes; single-select remains one row per (product_id, attribute_definition_id).
-- 2) supplier_offers: add sell_price for storefront price bounds/filtering (use sell price, not cost).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- product_attributes: drop one-row-per-attr constraint; add one-row-per-attr-per-value
-- -----------------------------------------------------------------------------
ALTER TABLE catalogos.product_attributes
  DROP CONSTRAINT IF EXISTS uq_product_attributes_product_attr;

-- Allow multiple rows per (product_id, attribute_definition_id) when value_text differs.
-- Single row per (product_id, attribute_definition_id) when value_text is null/empty (e.g. value_number used).
CREATE UNIQUE INDEX uq_product_attributes_product_attr_value
  ON catalogos.product_attributes (product_id, attribute_definition_id, COALESCE(value_text, ''));

-- Index for filter queries: by attribute and value (multi-select and single-select).
CREATE INDEX IF NOT EXISTS idx_product_attributes_def_value_product
  ON catalogos.product_attributes (attribute_definition_id, value_text)
  WHERE value_text IS NOT NULL AND value_text != '';

-- Expand comma-separated multi-select values into one row per value (distinct).
INSERT INTO catalogos.product_attributes (product_id, attribute_definition_id, value_text)
SELECT DISTINCT pa.product_id, pa.attribute_definition_id, trim(v.val)::TEXT
FROM catalogos.product_attributes pa
JOIN catalogos.attribute_definitions ad ON ad.id = pa.attribute_definition_id
CROSS JOIN LATERAL unnest(string_to_array(pa.value_text, ',')) AS v(val)
WHERE pa.value_text IS NOT NULL
  AND pa.value_text != ''
  AND pa.value_text LIKE '%,%'
  AND ad.attribute_key IN ('industries', 'compliance_certifications')
  AND trim(v.val) != '';

DELETE FROM catalogos.product_attributes pa
USING catalogos.attribute_definitions ad
WHERE ad.id = pa.attribute_definition_id
  AND pa.value_text IS NOT NULL
  AND pa.value_text LIKE '%,%'
  AND ad.attribute_key IN ('industries', 'compliance_certifications');

-- -----------------------------------------------------------------------------
-- supplier_offers: add sell_price (storefront uses for price bounds/filter)
-- -----------------------------------------------------------------------------
ALTER TABLE catalogos.supplier_offers
  ADD COLUMN IF NOT EXISTS sell_price NUMERIC(12,4) CHECK (sell_price IS NULL OR sell_price >= 0);

COMMENT ON COLUMN catalogos.supplier_offers.sell_price IS 'Customer-facing price; when null, storefront falls back to cost.';

UPDATE catalogos.supplier_offers SET sell_price = cost WHERE sell_price IS NULL;
