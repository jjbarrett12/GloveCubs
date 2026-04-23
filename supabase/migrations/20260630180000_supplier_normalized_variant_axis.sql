-- Explicit variant axis/value for family inference (alongside inferred_size for size variants).

ALTER TABLE catalogos.supplier_products_normalized
  ADD COLUMN IF NOT EXISTS variant_axis TEXT
    CHECK (variant_axis IS NULL OR variant_axis IN ('size', 'color', 'pack', 'thickness', 'length', 'none')),
  ADD COLUMN IF NOT EXISTS variant_value TEXT;

COMMENT ON COLUMN catalogos.supplier_products_normalized.variant_axis IS 'Which attribute differs within the family_group (size, color, pack, thickness, length).';
COMMENT ON COLUMN catalogos.supplier_products_normalized.variant_value IS 'Normalized value for variant_axis on this row (e.g. s, xl, blue, 100).';
